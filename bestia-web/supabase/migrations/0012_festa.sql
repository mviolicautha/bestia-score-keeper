-- Bestia: festa al tavolo, gli obiettivi sbloccati in una serata.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0011_calendario.sql (vedi SUPABASE.md).
--
-- game_unlocks(partita) dice, per ogni giocatore con account, quali obiettivi ha raggiunto proprio
-- con quella partita: la TV li festeggia a fine serata e ognuno se li vede sul telefono.
-- Per farlo il calcolo degli obiettivi di 0010 diventa valido per qualsiasi profilo e fino a una
-- certa partita (valid_games_of / metrics_of); my_valid_games e my_metrics restano uguali per l'app.

-- ---------------------------------------------------------------- calcolo per un profilo

-- Le partite valide di un profilo terminate entro p_until, senza p_exclude (come my_valid_games).
create or replace function public.valid_games_of(p_profile uuid, p_until timestamptz, p_exclude uuid)
returns table (game_id uuid, ended_at timestamptz, is_master boolean, balance int, stats jsonb, top boolean, bottom boolean)
language sql stable security definer set search_path = public as $$
  with valid as (
    select g.id, g.master_id, g.updated_at from public.games g
    where g.status = 'ended' and g.event_count >= 3
      and g.updated_at <= p_until and g.id is distinct from p_exclude
      and (select count(*) from public.game_results x where x.game_id = g.id) >= 2
  ),
  mine as (
    select distinct on (res.game_id) res.game_id, res.player_id, res.balance_cents, res.stats
    from public.game_results res
    where res.game_id in (select id from valid)
      and (exists (select 1 from public.game_seats s where s.game_id = res.game_id and s.player_id = res.player_id and s.profile_id = p_profile)
        or exists (
          select 1 from public.game_players gp join public.group_members m on m.id = gp.member_id
          where gp.game_id = res.game_id and gp.player_id = res.player_id and m.profile_id = p_profile
        ))
    order by res.game_id, res.balance_cents desc
  )
  select v.id, v.updated_at, v.master_id = p_profile, me.balance_cents, me.stats,
    me.balance_cents > 0 and not exists (
      select 1 from public.game_results o where o.game_id = v.id and o.player_id <> me.player_id and o.balance_cents >= me.balance_cents),
    me.player_id is not null and not exists (
      select 1 from public.game_results o where o.game_id = v.id and o.player_id <> me.player_id and o.balance_cents <= me.balance_cents)
  from valid v
  left join mine me on me.game_id = v.id
  where v.master_id = p_profile or me.game_id is not null;
$$;

-- Le misure degli obiettivi di un profilo (come my_metrics di 0010).
create or replace function public.metrics_of(p_profile uuid, p_until timestamptz, p_exclude uuid)
returns table (metric text, value int)
language sql stable security definer set search_path = public as $$
  with g as (select * from public.valid_games_of(p_profile, p_until, p_exclude)),
  p as (select * from g where balance is not null),
  st as (
    select coalesce((stats ->> 'hands')::int, 0) hands, coalesce((stats ->> 'tris')::int, 0) tris,
           coalesce((stats ->> 'streak')::int, 0) streak, coalesce((stats ->> 'soc')::int, 0) soc,
           coalesce((stats ->> 'bestie')::int, 0) bestie, coalesce((stats ->> 'misdeal')::int, 0) misdeal,
           coalesce((stats ->> 'min')::int, 0) min_cents, coalesce((stats ->> 'bet')::int, 0) bet, stats ->> 'nick' nick
    from p where stats is not null
  ),
  runs as (
    select balance > 0 as pos,
           row_number() over (order by ended_at) - row_number() over (partition by balance > 0 order by ended_at) as grp
    from p
  ),
  days as (
    select distinct (at at time zone 'Europe/Rome')::date as d from public.pack_openings
    where profile_id = p_profile and kind = 'giornaliera'
  ),
  owned as (
    select a.category from public.owned_items o join public.avatar_items a on a.id = o.item_id where o.profile_id = p_profile
  )
  select 'games', count(*)::int from g
  union all select 'mastered', count(*) filter (where is_master)::int from g
  union all select 'positive', count(*) filter (where balance > 0)::int from p
  union all select 'positive_streak', coalesce(max(n), 0)::int from (select count(*) n from runs where pos group by grp) s
  union all select 'top', count(*) filter (where top)::int from p
  union all select 'bottom', count(*) filter (where bottom)::int from p
  union all select 'hands', coalesce(sum(hands), 0)::int from st
  union all select 'tris', coalesce(sum(tris), 0)::int from st
  union all select 'hand_streak', coalesce(max(streak), 0)::int from st
  union all select 'soc', coalesce(sum(soc), 0)::int from st
  union all select 'max_bestie', coalesce(max(bestie), 0)::int from st
  union all select 'misdeal', coalesce(sum(misdeal), 0)::int from st
  union all select 'abyss', count(*) filter (where bet > 0 and min_cents <= -20 * bet)::int from st
  union all select 'nicks', count(distinct nick)::int from st
  union all select 'nick:' || nick, count(*)::int from st where nick is not null group by nick
  union all select 'owned', count(*)::int from owned
  union all select 'cat:' || category, count(*)::int from owned group by category
  union all select 'daily_streak', coalesce(max(n), 0)::int from (
    select count(*) n from (select d - (row_number() over (order by d))::int as grp from days) x group by grp
  ) s;
$$;

-- Le funzioni di 0010 usano ora il calcolo comune.
create or replace function public.my_valid_games()
returns table (game_id uuid, ended_at timestamptz, is_master boolean, balance int, stats jsonb, top boolean, bottom boolean)
language sql stable security definer set search_path = public as $$
  select * from public.valid_games_of(auth.uid(), 'infinity', null);
$$;

create or replace function public.my_metrics()
returns table (metric text, value int)
language sql stable security definer set search_path = public as $$
  select * from public.metrics_of(auth.uid(), 'infinity', null);
$$;

-- ---------------------------------------------------------------- obiettivi di una serata

-- Per ogni persona con account nella partita (giocatori e master): gli obiettivi raggiunti proprio
-- con questa partita, cioè che prima non c'erano e dopo sì. 'mine' = sono io.
-- 'ready' è falso finché il master non ha salvato i risultati.
create or replace function public.game_unlocks(p_game uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  g public.games;
  v_players jsonb := '[]'::jsonb;
  r record;
  v_ids jsonb;
begin
  if not public.can_read_game(p_game) then raise exception 'not_allowed'; end if;
  select * into g from public.games where id = p_game;
  if g.status <> 'ended' or not exists (select 1 from public.game_results where game_id = p_game and stats is not null) then
    return jsonb_build_object('ready', false, 'players', '[]'::jsonb);
  end if;

  for r in
    with people as (
      select distinct on (profile_id) profile_id, player_id, name from (
        select s.profile_id, res.player_id, res.name from public.game_results res
          join public.game_seats s on s.game_id = res.game_id and s.player_id = res.player_id
          where res.game_id = p_game
        union all
        select m.profile_id, res.player_id, res.name from public.game_results res
          join public.game_players gp on gp.game_id = res.game_id and gp.player_id = res.player_id
          join public.group_members m on m.id = gp.member_id
          where res.game_id = p_game and m.profile_id is not null
        union all
        -- il master che ha solo condotto
        select g.master_id, null, coalesce(pr.display_name, pr.username, 'Master') from public.profiles pr where pr.id = g.master_id
      ) x
      order by profile_id, player_id nulls last
    )
    select * from people
  loop
    -- prima (senza questa partita) e dopo (fino a questa partita), calcolati una volta sola
    with before as (select * from public.metrics_of(r.profile_id, g.updated_at, p_game)),
    after as (select * from public.metrics_of(r.profile_id, g.updated_at, null))
    select coalesce(jsonb_agg(d.id order by d.id), '[]'::jsonb) into v_ids
    from public.achievement_defs d
    left join before b on b.metric = d.metric
    left join after a on a.metric = d.metric
    where d.goal is not null and coalesce(b.value, 0) < d.goal and coalesce(a.value, 0) >= d.goal;
    if jsonb_array_length(v_ids) > 0 then
      v_players := v_players || jsonb_build_object('player_id', r.player_id, 'name', r.name, 'mine', r.profile_id = auth.uid(), 'achievements', v_ids);
    end if;
  end loop;

  return jsonb_build_object('ready', true, 'players', v_players);
end $$;

-- ---------------------------------------------------------------- permessi

revoke all on function public.valid_games_of(uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.metrics_of(uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.my_valid_games() from public, anon, authenticated;
revoke all on function public.my_metrics() from public, anon, authenticated;
revoke all on function public.game_unlocks(uuid) from public, anon;
grant execute on function public.game_unlocks(uuid) to authenticated;
