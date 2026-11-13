-- Bestia: partite dentro le compagnie, e partite non più leggibili da chiunque.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0006_compagnie.sql (vedi SUPABASE.md).
--
-- 1. Una partita può appartenere a una compagnia (games.group_id): la vedono tutti i membri.
--    Senza compagnia è una "partita al volo", come prima.
-- 2. I giocatori della partita si possono legare ai membri della compagnia (game_players): se
--    il membro ha un account, il suo telefono risulta già seduto a quel posto.
-- 3. Fino a 0006 ogni utente collegato poteva elencare TUTTE le partite. Ora una partita la vede
--    solo chi: la conduce, è nella sua compagnia, ha un posto, oppure l'ha aperta con il codice o
--    il link (QR, TV): in quel caso diventa "spettatore" (game_viewers) tramite watch_game.

-- ---------------------------------------------------------------- tabelle

alter table public.games add column if not exists group_id uuid references public.groups on delete set null;
create index if not exists games_group_idx on public.games (group_id, updated_at desc) where group_id is not null;

create table if not exists public.game_players (
  game_id uuid not null references public.games on delete cascade,
  player_id text not null,
  member_id uuid references public.group_members on delete set null,
  primary key (game_id, player_id)
);
create unique index if not exists game_players_member_key on public.game_players (game_id, member_id) where member_id is not null;

create table if not exists public.game_viewers (
  game_id uuid not null references public.games on delete cascade,
  profile_id uuid not null references auth.users on delete cascade,
  at timestamptz not null default now(),
  primary key (game_id, profile_id)
);

-- ---------------------------------------------------------------- chi può vedere una partita

create or replace function public.can_read_game(p_game uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game and (
      g.master_id = auth.uid()
      or (g.group_id is not null and public.is_group_member(g.group_id))
      or exists (select 1 from public.game_seats s where s.game_id = g.id and s.profile_id = auth.uid())
      or exists (select 1 from public.game_viewers v where v.game_id = g.id and v.profile_id = auth.uid())
    )
  );
$$;

alter table public.game_players enable row level security;
alter table public.game_viewers enable row level security;

drop policy if exists "partite leggibili" on public.games;
create policy "partite: chi ne fa parte" on public.games for select to authenticated using (public.can_read_game(id));

drop policy if exists "eventi leggibili" on public.game_events;
create policy "eventi: chi vede la partita" on public.game_events for select to authenticated using (public.can_read_game(game_id));

drop policy if exists "posti leggibili" on public.game_seats;
create policy "posti: chi vede la partita" on public.game_seats for select to authenticated using (public.can_read_game(game_id));

create policy "giocatori: chi vede la partita" on public.game_players for select to authenticated using (public.can_read_game(game_id));
create policy "spettatori: i propri" on public.game_viewers for select to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------- funzioni

-- Apre una partita dal codice (QR, codice dettato) o dal link (TV): chi la apre diventa
-- spettatore e da lì in poi la legge e ne riceve gli aggiornamenti. null se non esiste.
create or replace function public.watch_game(p_id uuid default null, p_code text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_id is not null then
    select id into v_id from public.games where id = p_id;
  else
    select id into v_id from public.games where code = upper(trim(p_code));
  end if;
  if v_id is null then return null; end if;
  insert into public.game_viewers (game_id, profile_id) values (v_id, auth.uid()) on conflict do nothing;
  return v_id;
end $$;

-- Come prima, con la compagnia facoltativa (bisogna farne parte).
drop function if exists public.create_game(text, int);
create or replace function public.create_game(p_title text, p_base_bet_cents int, p_group uuid default null)
returns public.games
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- niente 0/O, 1/I
  v_code text;
  v_game public.games;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_group is not null and not public.is_group_member(p_group) then raise exception 'not_member'; end if;
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.games where code = v_code);
  end loop;
  insert into public.games (code, title, master_id, event_count, group_id)
    values (v_code, p_title, auth.uid(), 1, p_group) returning * into v_game;
  insert into public.game_events (game_id, seq, event)
    values (v_game.id, 1, jsonb_build_object('type', 'game_started', 'baseBetCents', p_base_bet_cents));
  return v_game;
end $$;

-- Il master lega un giocatore della partita a un membro della compagnia. Se il membro ha un
-- account, il suo telefono prende subito quel posto (se non ne ha già un altro).
create or replace function public.link_game_player(p_game uuid, p_player text, p_member uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
  v_m public.group_members;
begin
  select group_id into v_group from public.games where id = p_game and master_id = auth.uid();
  if not found then raise exception 'not_master'; end if;
  select * into v_m from public.group_members where id = p_member;
  if v_m.id is null or v_group is null or v_m.group_id <> v_group then raise exception 'not_in_group'; end if;
  insert into public.game_players (game_id, player_id, member_id) values (p_game, p_player, p_member)
    on conflict (game_id, player_id) do update set member_id = excluded.member_id;
  if v_m.profile_id is not null then
    insert into public.game_seats (game_id, player_id, profile_id) values (p_game, p_player, v_m.profile_id)
      on conflict do nothing;
  end if;
end $$;

revoke all on function public.can_read_game(uuid) from public, anon;
revoke all on function public.watch_game(uuid, text) from public, anon;
revoke all on function public.create_game(text, int, uuid) from public, anon;
revoke all on function public.link_game_player(uuid, text, uuid) from public, anon;
grant execute on function public.can_read_game(uuid) to authenticated;
grant execute on function public.watch_game(uuid, text) to authenticated;
grant execute on function public.create_game(text, int, uuid) to authenticated;
grant execute on function public.link_game_player(uuid, text, uuid) to authenticated;
