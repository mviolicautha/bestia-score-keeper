-- Bestia: account con username e password.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0004_personaggi_condivisi.sql (vedi SUPABASE.md).
--
-- Niente email vera: l'app trasforma l'utente anonimo del telefono in un utente con password,
-- usando come "email" un indirizzo finto ricavato dall'username (mai usato per spedire nulla;
-- in Supabase la conferma email va spenta). L'id resta lo stesso: le partite fatte da quel
-- telefono restano sue. Qui si tiene l'username nel profilo, unico, e si permette di eliminare
-- il proprio account senza perdere le partite che si sono condotte da master.

-- ---------------------------------------------------------------- username nel profilo

alter table public.profiles add column if not exists username text;

alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_check
  check (username is null or username ~ '^[a-z0-9][a-z0-9_.]{2,19}$');

-- unico: l'app lo salva già in minuscolo, il controllo sopra lo garantisce
create unique index if not exists profiles_username_key on public.profiles (username);

-- L'username si sceglie solo con claim_username (che controlla che sia libero): dal browser si
-- possono modificare soltanto nome visualizzato e personaggio.
revoke insert, update on public.profiles from authenticated, anon;
grant insert (id, display_name, character, updated_at) on public.profiles to authenticated;
-- (anche id: l'upsert dell'app lo riscrive uguale; la regola RLS impone che sia il proprio)
grant update (id, display_name, character, updated_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------- funzioni

-- È libero? (per il controllo mentre si scrive; quello vero lo fa claim_username)
create or replace function public.username_available(p_username text)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where username = lower(trim(p_username)));
$$;

-- Primo passo della registrazione: riserva l'username per l'utente (ancora anonimo).
-- Se l'app poi non riesce a impostare la password, lo libera con release_username.
create or replace function public.claim_username(p_username text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := lower(trim(p_username));
  v_current text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_name !~ '^[a-z0-9][a-z0-9_.]{2,19}$' then raise exception 'invalid_username'; end if;
  select username into v_current from public.profiles where id = auth.uid();
  if v_current is not null and v_current <> v_name then raise exception 'already_registered'; end if;
  if exists (select 1 from public.profiles where username = v_name and id <> auth.uid()) then
    raise exception 'username_taken';
  end if;
  insert into public.profiles (id, username, display_name)
    values (auth.uid(), v_name, v_name)
    on conflict (id) do update
      set username = excluded.username,
          display_name = coalesce(public.profiles.display_name, excluded.display_name),
          updated_at = now();
end $$;

-- Annulla la riserva se la registrazione non è andata in porto (solo finché si è anonimi).
create or replace function public.release_username()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    update public.profiles set username = null where id = auth.uid();
  end if;
end $$;

-- Elimina il proprio account. Le partite condotte da master restano (senza master), così lo
-- storico degli altri non si rompe; posti presi, richieste e profilo se ne vanno con l'utente.
alter table public.games alter column master_id drop not null;
alter table public.games drop constraint if exists games_master_id_fkey;
alter table public.games add constraint games_master_id_fkey
  foreign key (master_id) references auth.users on delete set null;

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.username_available(text) from public, anon;
revoke all on function public.claim_username(text) from public, anon;
revoke all on function public.release_username() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.claim_username(text) to authenticated;
grant execute on function public.release_username() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
