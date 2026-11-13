-- Bestia: storico delle partite.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0007_partite_compagnie.sql (vedi SUPABASE.md).
--
-- 1. A fine partita il master salva il saldo finale di ogni giocatore (game_results): lo storico
--    legge da qui e non deve rigiocare tutte le mani. Se la partita viene riaperta, i risultati
--    si cancellano e si risalvano alla nuova chiusura.
-- 2. my_history(): le partite terminate in cui ho giocato (dal mio posto o dal mio membro della
--    compagnia, anche se l'ho reclamato dopo) o che ho condotto.
-- 3. import_game(): carica in un colpo solo una partita fatta in locale sul telefono, con le date
--    originali.

-- ---------------------------------------------------------------- tabella

create table if not exists public.game_results (
  game_id uuid not null references public.games on delete cascade,
  player_id text not null,
  name text not null,
  balance_cents int not null,
  primary key (game_id, player_id)
);

alter table public.game_results enable row level security;
create policy "risultati: chi vede la partita" on public.game_results for select to authenticated using (public.can_read_game(game_id));

-- ---------------------------------------------------------------- funzioni

-- Il master salva i risultati: [{ "player_id": "...", "name": "...", "balance_cents": 120 }, ...].
-- Se la partita non è terminata li cancella soltanto.
create or replace function public.save_game_results(p_game uuid, p_results jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.games where id = p_game and master_id = auth.uid();
  if v_status is null then raise exception 'not_master'; end if;
  delete from public.game_results where game_id = p_game;
  if v_status = 'ended' and jsonb_typeof(p_results) = 'array' then
    insert into public.game_results (game_id, player_id, name, balance_cents)
      select p_game, r ->> 'player_id', left(r ->> 'name', 40), (r ->> 'balance_cents')::int
      from jsonb_array_elements(p_results) r;
  end if;
end $$;

-- Le mie partite terminate, dalla più recente.
create or replace function public.my_history()
returns table (
  game_id uuid,
  title text,
  ended_at timestamptz,
  group_id uuid,
  group_name text,
  is_master boolean,
  my_name text,
  my_balance_cents int,
  player_count int,
  winner_name text,
  winner_balance_cents int
)
language sql stable security definer set search_path = public as $$
  with mine as (
    -- il giocatore che ero in ogni partita: dal posto preso o dal membro della compagnia
    select r.game_id, r.player_id, r.name, r.balance_cents
    from public.game_results r
    where exists (select 1 from public.game_seats s where s.game_id = r.game_id and s.player_id = r.player_id and s.profile_id = auth.uid())
       or exists (
         select 1 from public.game_players gp join public.group_members m on m.id = gp.member_id
         where gp.game_id = r.game_id and gp.player_id = r.player_id and m.profile_id = auth.uid()
       )
  ),
  ended as (
    select g.* from public.games g
    where g.status = 'ended'
      and (g.master_id = auth.uid() or g.id in (select game_id from mine))
      and exists (select 1 from public.game_results r where r.game_id = g.id)
  )
  select
    g.id,
    g.title,
    g.updated_at,
    g.group_id,
    gr.name,
    coalesce(g.master_id = auth.uid(), false),
    me.name,
    me.balance_cents,
    (select count(*)::int from public.game_results r where r.game_id = g.id),
    w.name,
    w.balance_cents
  from ended g
  left join public.groups gr on gr.id = g.group_id
  left join lateral (select * from mine where mine.game_id = g.id limit 1) me on true
  left join lateral (
    select r.name, r.balance_cents from public.game_results r where r.game_id = g.id order by r.balance_cents desc limit 1
  ) w on true
  order by g.updated_at desc;
$$;

-- Importa una partita fatta in locale: p_events = [{ "event": {...}, "at": "2026-11-01T21:00:00Z" }, ...]
-- (il primo è game_started). Chi importa ne diventa il master.
create or replace function public.import_game(p_title text, p_events jsonb, p_status text, p_group uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_id uuid;
  v_count int := jsonb_array_length(p_events);
  v_first timestamptz := coalesce((p_events -> 0 ->> 'at')::timestamptz, now());
  v_last timestamptz := coalesce((p_events -> (jsonb_array_length(p_events) - 1) ->> 'at')::timestamptz, now());
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_group is not null and not public.is_group_member(p_group) then raise exception 'not_member'; end if;
  if v_count < 1 or p_events -> 0 -> 'event' ->> 'type' <> 'game_started' then raise exception 'invalid_events'; end if;
  if p_status not in ('not_started', 'in_progress', 'ended') then raise exception 'invalid_status'; end if;
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.games where code = v_code);
  end loop;
  insert into public.games (code, title, master_id, status, event_count, group_id, created_at, updated_at)
    values (v_code, left(trim(p_title), 60), auth.uid(), p_status, v_count, p_group, v_first, v_last)
    returning id into v_id;
  insert into public.game_events (game_id, seq, event, at)
    select v_id, e.ord::int, e.value -> 'event', coalesce((e.value ->> 'at')::timestamptz, now())
    from jsonb_array_elements(p_events) with ordinality as e(value, ord);
  return v_id;
end $$;

revoke all on function public.save_game_results(uuid, jsonb) from public, anon;
revoke all on function public.my_history() from public, anon;
revoke all on function public.import_game(text, jsonb, text, uuid) from public, anon;
grant execute on function public.save_game_results(uuid, jsonb) to authenticated;
grant execute on function public.my_history() to authenticated;
grant execute on function public.import_game(text, jsonb, text, uuid) to authenticated;
