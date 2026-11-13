-- Bestia: compagnie di amici.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0005_account.sql (vedi SUPABASE.md).
--
-- Una compagnia (groups) è il gruppo di amici che gioca insieme: ha un nome e un codice invito.
-- I suoi membri (group_members) sono persone con un nome: esistono anche senza account (ospiti
-- aggiunti dal master) e un account può collegarsi a uno di loro ("Sono io"). Un account ha al
-- più un membro per compagnia, ma può stare in quante compagnie vuole.
--
-- Chi ha creato la compagnia ne è amministratore e può nominarne altri. Gli amministratori
-- gestiscono solo la compagnia (nome, codice, membri): non toccano mai gli account.
-- Tutte le modifiche passano da funzioni che controllano chi le chiede; le tabelle si leggono
-- soltanto, e solo dai membri della compagnia.

-- ---------------------------------------------------------------- tabelle

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  invite_code text not null unique,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 20),
  -- personaggio degli ospiti; chi ha l'account usa quello del suo profilo
  character jsonb check (character is null or (jsonb_typeof(character) = 'object' and pg_column_size(character) < 8192)),
  profile_id uuid references auth.users on delete set null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);
create unique index if not exists group_members_name_key on public.group_members (group_id, lower(trim(name)));
create unique index if not exists group_members_profile_key on public.group_members (group_id, profile_id) where profile_id is not null;
create index if not exists group_members_profile_idx on public.group_members (profile_id) where profile_id is not null;

-- ---------------------------------------------------------------- chi è chi

create or replace function public.is_group_member(p_group uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = p_group and profile_id = auth.uid());
$$;

create or replace function public.is_group_admin(p_group uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = p_group and profile_id = auth.uid() and role = 'admin');
$$;

-- Solo chi ha un account (non gli ospiti anonimi) crea compagnie o ci entra.
create or replace function public.require_account()
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) then raise exception 'account_required'; end if;
end $$;

-- Se una compagnia resta senza amministratori (l'ultimo esce o elimina l'account), lo diventa
-- il membro con account entrato per primo.
create or replace function public.ensure_group_admin(p_group uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.group_members where group_id = p_group and role = 'admin' and profile_id is not null) then
    update public.group_members set role = 'admin'
      where id = (select id from public.group_members where group_id = p_group and profile_id is not null order by created_at limit 1);
  end if;
end $$;

create or replace function public.new_group_code()
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- niente 0/O, 1/I
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where invite_code = v_code);
  end loop;
  return v_code;
end $$;

-- ---------------------------------------------------------------- sicurezza (RLS)

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "compagnie: le vedono i membri" on public.groups for select to authenticated using (public.is_group_member(id));
create policy "membri: li vedono i membri" on public.group_members for select to authenticated using (public.is_group_member(group_id));
-- nessuna regola di scrittura: si modifica solo con le funzioni qui sotto

-- ---------------------------------------------------------------- funzioni: entrare e uscire

-- Crea la compagnia; chi la crea entra come amministratore col nome scelto.
create or replace function public.create_group(p_name text, p_member_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  perform public.require_account();
  insert into public.groups (name, invite_code, created_by)
    values (trim(p_name), public.new_group_code(), auth.uid()) returning id into v_group;
  insert into public.group_members (group_id, name, profile_id, role)
    values (v_group, trim(p_member_name), auth.uid(), 'admin');
  return v_group;
end $$;

-- Chi ha il codice vede nome della compagnia e membri ancora senza account, per dire chi è.
create or replace function public.preview_group_invite(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_group public.groups;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_group from public.groups where invite_code = upper(trim(p_code));
  if v_group.id is null then return null; end if;
  return jsonb_build_object(
    'id', v_group.id,
    'name', v_group.name,
    'already_member', public.is_group_member(v_group.id),
    'member_count', (select count(*) from public.group_members where group_id = v_group.id),
    'unclaimed', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'character', m.character) order by lower(m.name))
      from public.group_members m where m.group_id = v_group.id and m.profile_id is null
    ), '[]'::jsonb)
  );
end $$;

-- Entra con il codice: "Sono io" (p_member = un membro senza account) oppure "Sono nuovo"
-- (p_new_name). Scelta libera: se qualcuno sbaglia, un amministratore lo scollega.
create or replace function public.join_group(p_code text, p_member uuid default null, p_new_name text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  perform public.require_account();
  select id into v_group from public.groups where invite_code = upper(trim(p_code));
  if v_group is null then raise exception 'invalid_code'; end if;
  if public.is_group_member(v_group) then raise exception 'already_member'; end if;
  if p_member is not null then
    update public.group_members set profile_id = auth.uid()
      where id = p_member and group_id = v_group and profile_id is null;
    if not found then raise exception 'member_taken'; end if;
  else
    if p_new_name is null or trim(p_new_name) = '' then raise exception 'name_required'; end if;
    insert into public.group_members (group_id, name, profile_id) values (v_group, trim(p_new_name), auth.uid());
  end if;
  return v_group;
end $$;

-- Esce dalla compagnia: il suo membro resta (con lo storico) ma senza account.
create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.group_members set profile_id = null, role = 'member'
    where group_id = p_group and profile_id = auth.uid();
  perform public.ensure_group_admin(p_group);
end $$;

-- ---------------------------------------------------------------- funzioni: membri

-- Aggiunge un ospite (senza account). Lo può fare qualsiasi membro: chi conduce una partita
-- deve poter aggiungere l'amico venuto per la prima volta.
create or replace function public.add_group_member(p_group uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_group_member(p_group) then raise exception 'not_member'; end if;
  insert into public.group_members (group_id, name) values (p_group, trim(p_name)) returning id into v_id;
  return v_id;
end $$;

-- Rinomina: un amministratore chiunque, ognuno sé stesso.
create or replace function public.rename_group_member(p_member uuid, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_m public.group_members;
begin
  select * into v_m from public.group_members where id = p_member;
  if v_m.id is null then raise exception 'not_found'; end if;
  if not (public.is_group_admin(v_m.group_id) or v_m.profile_id = auth.uid()) then raise exception 'not_allowed'; end if;
  update public.group_members set name = trim(p_name) where id = p_member;
end $$;

-- Personaggio di un ospite: lo crea qualsiasi membro (di solito il master durante la serata).
create or replace function public.set_group_member_character(p_member uuid, p_character jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_m public.group_members;
begin
  select * into v_m from public.group_members where id = p_member;
  if v_m.id is null then raise exception 'not_found'; end if;
  if not public.is_group_member(v_m.group_id) then raise exception 'not_member'; end if;
  update public.group_members set character = p_character where id = p_member;
end $$;

-- Scollega l'account da un membro (un "Sono io" sbagliato): il membro resta come ospite.
create or replace function public.unlink_group_member(p_member uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_m public.group_members;
begin
  select * into v_m from public.group_members where id = p_member;
  if v_m.id is null then raise exception 'not_found'; end if;
  if not public.is_group_admin(v_m.group_id) then raise exception 'not_admin'; end if;
  if v_m.profile_id = auth.uid() then raise exception 'use_leave'; end if;
  update public.group_members set profile_id = null, role = 'member' where id = p_member;
end $$;

-- Toglie un membro dalla compagnia (solo amministratori, mai sé stessi: per quello c'è "Esci").
create or replace function public.remove_group_member(p_member uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_m public.group_members;
begin
  select * into v_m from public.group_members where id = p_member;
  if v_m.id is null then raise exception 'not_found'; end if;
  if not public.is_group_admin(v_m.group_id) then raise exception 'not_admin'; end if;
  if v_m.profile_id = auth.uid() then raise exception 'use_leave'; end if;
  delete from public.group_members where id = p_member;
end $$;

-- Nomina o toglie un amministratore. Deve sempre restarne almeno uno.
create or replace function public.set_group_member_role(p_member uuid, p_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_m public.group_members;
begin
  select * into v_m from public.group_members where id = p_member;
  if v_m.id is null then raise exception 'not_found'; end if;
  if not public.is_group_admin(v_m.group_id) then raise exception 'not_admin'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid_role'; end if;
  if p_role = 'admin' and v_m.profile_id is null then raise exception 'needs_account'; end if;
  if p_role = 'member' and v_m.role = 'admin' and not exists (
    select 1 from public.group_members where group_id = v_m.group_id and role = 'admin' and profile_id is not null and id <> p_member
  ) then raise exception 'last_admin'; end if;
  update public.group_members set role = p_role where id = p_member;
end $$;

-- ---------------------------------------------------------------- funzioni: la compagnia

create or replace function public.rename_group(p_group uuid, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_admin(p_group) then raise exception 'not_admin'; end if;
  update public.groups set name = trim(p_name) where id = p_group;
end $$;

-- Nuovo codice: quello vecchio smette di funzionare (chi è già dentro resta).
create or replace function public.regenerate_group_code(p_group uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.is_group_admin(p_group) then raise exception 'not_admin'; end if;
  v_code := public.new_group_code();
  update public.groups set invite_code = v_code where id = p_group;
  return v_code;
end $$;

-- ---------------------------------------------------------------- eliminare l'account

-- Come in 0005, ma prima l'account esce dalle sue compagnie: i suoi membri restano come ospiti
-- (lo storico non si rompe) e ogni compagnia mantiene un amministratore.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_group uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  for v_group in select group_id from public.group_members where profile_id = auth.uid() loop
    perform public.leave_group(v_group);
  end loop;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- permessi

do $$
declare f text;
begin
  foreach f in array array[
    'is_group_member(uuid)', 'is_group_admin(uuid)', 'require_account()', 'ensure_group_admin(uuid)', 'new_group_code()',
    'create_group(text, text)', 'preview_group_invite(text)', 'join_group(text, uuid, text)', 'leave_group(uuid)',
    'add_group_member(uuid, text)', 'rename_group_member(uuid, text)', 'set_group_member_character(uuid, jsonb)',
    'unlink_group_member(uuid)', 'remove_group_member(uuid)', 'set_group_member_role(uuid, text)',
    'rename_group(uuid, text)', 'regenerate_group_code(uuid)', 'delete_my_account()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
  end loop;
  -- quelle che l'app chiama direttamente
  foreach f in array array[
    'create_group(text, text)', 'preview_group_invite(text)', 'join_group(text, uuid, text)', 'leave_group(uuid)',
    'add_group_member(uuid, text)', 'rename_group_member(uuid, text)', 'set_group_member_character(uuid, jsonb)',
    'unlink_group_member(uuid)', 'remove_group_member(uuid)', 'set_group_member_role(uuid, text)',
    'rename_group(uuid, text)', 'regenerate_group_code(uuid)', 'delete_my_account()'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
-- is_group_member / is_group_admin servono alle regole RLS: le esegue chi legge le tabelle
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;

-- ---------------------------------------------------------------- tempo reale

-- Chi guarda la pagina della compagnia vede subito entrare i nuovi membri.
alter publication supabase_realtime add table public.group_members;
