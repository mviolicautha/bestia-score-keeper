-- Bestia: obiettivi e sfide settimanali, con premi in gettoni o bustine.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0009_bustine.sql (vedi SUPABASE.md).
--
-- 1. A fine partita il master salva, oltre al saldo, le statistiche della serata di ogni
--    giocatore (game_results.stats: mani, prese, bestie, soprannome...). Le partite già giocate
--    le completa il telefono del master la prima volta che apre "Obiettivi".
-- 2. Obiettivi una tantum (achievement_defs) e 3 sfide a settimana uguali per tutti (weekly_defs):
--    chi li ha raggiunti lo calcola il database, l'app li riscuote con claim_goals().
-- 3. Le bustine vinte finiscono nel portafoglio (wallets.pack_classica / pack_oro) e open_pack le
--    usa prima dei gettoni.
--
-- Titoli, soglie e premi devono restare allineati con src/lib/achievements.ts; i valori delle
-- bustine in open_pack con src/lib/avatar/packs.ts (i test lo controllano).

-- ---------------------------------------------------------------- tabelle

alter table public.game_results add column if not exists stats jsonb;

alter table public.wallets add column if not exists pack_classica int not null default 0 check (pack_classica >= 0);
alter table public.wallets add column if not exists pack_oro int not null default 0 check (pack_oro >= 0);

create table if not exists public.achievement_claims (
  profile_id uuid not null references auth.users on delete cascade,
  achievement_id text not null,
  at timestamptz not null default now(),
  primary key (profile_id, achievement_id)
);

-- challenge_id 'bonus' = la bustina per averle fatte tutte
create table if not exists public.weekly_claims (
  profile_id uuid not null references auth.users on delete cascade,
  week date not null,
  challenge_id text not null,
  at timestamptz not null default now(),
  primary key (profile_id, week, challenge_id)
);

alter table public.achievement_claims enable row level security;
alter table public.weekly_claims enable row level security;
drop policy if exists "obiettivi: i miei" on public.achievement_claims;
create policy "obiettivi: i miei" on public.achievement_claims for select to authenticated using (profile_id = auth.uid());
drop policy if exists "sfide: le mie" on public.weekly_claims;
create policy "sfide: le mie" on public.weekly_claims for select to authenticated using (profile_id = auth.uid());
revoke insert, update, delete on public.achievement_claims, public.weekly_claims from authenticated, anon;

-- ---------------------------------------------------------------- definizioni

-- (id, misura, soglia, gettoni, bustina). Soglia null = tutti i pezzi della categoria.
create or replace view public.achievement_defs as
select * from (values
  ('partite_1', 'games', 1, 0, 'classica'),
  ('partite_3', 'games', 3, 150, null),
  ('partite_5', 'games', 5, 250, null),
  ('partite_10', 'games', 10, 0, 'oro'),
  ('master_1', 'mastered', 1, 100, null),
  ('mani_50', 'hands', 50, 100, null),
  ('mani_150', 'hands', 150, 200, null),
  ('attivo_1', 'positive', 1, 100, null),
  ('attivo_fila_2', 'positive_streak', 2, 200, null),
  ('re_1', 'top', 1, 100, null),
  ('re_3', 'top', 3, 0, 'oro'),
  ('tris_1', 'tris', 1, 75, null),
  ('tris_5', 'tris', 5, 200, null),
  ('fila_3', 'hand_streak', 3, 150, null),
  ('societa_1', 'soc', 1, 75, null),
  ('societa_5', 'soc', 5, 150, null),
  ('tripla_bestia', 'max_bestie', 3, 150, null),
  ('mani_di_burro', 'misdeal', 1, 75, null),
  ('abisso', 'abyss', 1, 150, null),
  ('ultimo', 'bottom', 1, 100, null),
  ('nick_re', 'nick:re', 1, 75, null),
  ('nick_bancomat', 'nick:bancomat', 1, 75, null),
  ('nick_rimonta', 'nick:rimonta', 1, 75, null),
  ('nick_bestia_nera', 'nick:bestia_nera', 1, 75, null),
  ('nick_paperone', 'nick:paperone', 1, 75, null),
  ('nick_cecchino', 'nick:cecchino', 1, 75, null),
  ('nick_fantasma', 'nick:fantasma', 1, 75, null),
  ('nick_ottovolante', 'nick:ottovolante', 1, 75, null),
  ('nick_equilibrista', 'nick:equilibrista', 1, 75, null),
  ('nick_muro', 'nick:muro', 1, 75, null),
  ('nick_turista', 'nick:turista', 1, 75, null),
  ('soprannomi_8', 'nicks', 8, 0, 'oro'),
  ('album_25', 'owned', 25, 0, 'classica'),
  ('album_50', 'owned', 50, 0, 'oro'),
  ('giornaliera_7', 'daily_streak', 7, 0, 'classica'),
  ('cat_facial', 'cat:facial', null, 150, null),
  ('cat_glasses', 'cat:glasses', null, 150, null),
  ('cat_hat', 'cat:hat', null, 150, null),
  ('cat_outfit', 'cat:outfit', null, 150, null),
  ('cat_costume', 'cat:costume', null, 150, null),
  ('cat_mouth', 'cat:mouth', null, 150, null),
  ('cat_back', 'cat:back', null, 150, null),
  ('cat_extra', 'cat:extra', null, 150, null)
) as d (id, metric, goal, coins, pack);

-- (id, misura della settimana, soglia, solo giocando). Ogni sfida vale 40 gettoni; farle tutte e
-- 3 vale una bustina classica.
create or replace view public.weekly_defs as
select * from (values
  ('w_partita', 'games', 1),
  ('w_partite_2', 'games', 2),
  ('w_mani_25', 'hands', 25),
  ('w_prese_10', 'tricks', 10),
  ('w_giornaliera_3', 'daily', 3),
  ('w_vinte_5', 'won', 5),
  ('w_societa', 'soc', 1),
  ('w_tris', 'tris', 1),
  ('w_bestia', 'bestie', 1)
) as d (id, metric, goal);

-- ---------------------------------------------------------------- risultati con statistiche

-- Come in 0008, più le statistiche: [{ "player_id", "name", "balance_cents", "stats": {...} }].
create or replace function public.save_game_results(p_game uuid, p_results jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.games where id = p_game and master_id = auth.uid();
  if v_status is null then raise exception 'not_master'; end if;
  delete from public.game_results where game_id = p_game;
  if v_status = 'ended' and jsonb_typeof(p_results) = 'array' then
    insert into public.game_results (game_id, player_id, name, balance_cents, stats)
      select p_game, r ->> 'player_id', left(r ->> 'name', 40), (r ->> 'balance_cents')::int,
             case when jsonb_typeof(r -> 'stats') = 'object' then r -> 'stats' end
      from jsonb_array_elements(p_results) r;
  end if;
end $$;

-- Le partite terminate che conduco e che non hanno ancora le statistiche (per completarle).
create or replace function public.games_missing_stats()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select g.id from public.games g
  where g.master_id = auth.uid() and g.status = 'ended'
    and exists (select 1 from public.game_results r where r.game_id = g.id and r.stats is null)
  order by g.updated_at desc
  limit 50;
$$;

-- ---------------------------------------------------------------- calcolo

-- Le mie partite valide (terminate, almeno 2 giocatori e 2 mani), con il mio risultato se ho
-- giocato: come per i gettoni di 0009, vale il posto preso o il membro della compagnia.
create or replace function public.my_valid_games()
returns table (game_id uuid, ended_at timestamptz, is_master boolean, balance int, stats jsonb, top boolean, bottom boolean)
language sql stable security definer set search_path = public as $$
  with valid as (
    select g.id, g.master_id, g.updated_at from public.games g
    where g.status = 'ended' and g.event_count >= 3
      and (select count(*) from public.game_results x where x.game_id = g.id) >= 2
  ),
  mine as (
    select distinct on (res.game_id) res.game_id, res.player_id, res.balance_cents, res.stats
    from public.game_results res
    where res.game_id in (select id from valid)
      and (exists (select 1 from public.game_seats s where s.game_id = res.game_id and s.player_id = res.player_id and s.profile_id = auth.uid())
        or exists (
          select 1 from public.game_players gp join public.group_members m on m.id = gp.member_id
          where gp.game_id = res.game_id and gp.player_id = res.player_id and m.profile_id = auth.uid()
        ))
    order by res.game_id, res.balance_cents desc
  )
  select v.id, v.updated_at, v.master_id = auth.uid(), me.balance_cents, me.stats,
    -- saldo più alto (in attivo) o più basso, senza pari merito
    me.balance_cents > 0 and not exists (
      select 1 from public.game_results o where o.game_id = v.id and o.player_id <> me.player_id and o.balance_cents >= me.balance_cents),
    me.player_id is not null and not exists (
      select 1 from public.game_results o where o.game_id = v.id and o.player_id <> me.player_id and o.balance_cents <= me.balance_cents)
  from valid v
  left join mine me on me.game_id = v.id
  where v.master_id = auth.uid() or me.game_id is not null;
$$;

-- Il valore di ogni misura degli obiettivi per me.
create or replace function public.my_metrics()
returns table (metric text, value int)
language sql stable security definer set search_path = public as $$
  with g as (select * from public.my_valid_games()),
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
    where profile_id = auth.uid() and kind = 'giornaliera'
  ),
  owned as (
    select a.category from public.owned_items o join public.avatar_items a on a.id = o.item_id where o.profile_id = auth.uid()
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

-- Gli obiettivi con il mio valore, la soglia e se li ho già riscossi.
create or replace function public.my_achievement_rows()
returns table (id text, value int, goal int, coins int, pack text, claimed boolean)
language sql stable security definer set search_path = public as $$
  with m as (select * from public.my_metrics())
  select d.id,
         coalesce((select m.value from m where m.metric = d.metric), 0),
         coalesce(d.goal, (select count(*)::int from public.avatar_items a where a.active and 'cat:' || a.category = d.metric)),
         d.coins, d.pack,
         exists (select 1 from public.achievement_claims c where c.profile_id = auth.uid() and c.achievement_id = d.id)
  from public.achievement_defs d;
$$;

-- Lunedì della settimana in corso (ora italiana).
create or replace function public.rome_week()
returns date
language sql stable set search_path = public as $$
  select date_trunc('week', public.rome_today())::date;
$$;

-- Le 3 sfide della settimana, uguali per tutti: 2 che si fanno solo giocando e 1 di gioco.
create or replace function public.week_challenges(p_week date)
returns text[]
language sql immutable as $$
  with n as (select ((p_week - date '2026-01-05') / 7) as w)
  select array[
    (array['w_partita', 'w_partite_2', 'w_mani_25', 'w_prese_10', 'w_giornaliera_3'])[1 + mod(w, 5)],
    (array['w_partita', 'w_partite_2', 'w_mani_25', 'w_prese_10', 'w_giornaliera_3'])[1 + mod(w + 2, 5)],
    (array['w_vinte_5', 'w_societa', 'w_tris', 'w_bestia'])[1 + mod(w, 4)]
  ] from n;
$$;

-- Le sfide di questa settimana con il mio valore.
create or replace function public.my_weekly_rows()
returns table (id text, value int, goal int, claimed boolean)
language sql stable security definer set search_path = public as $$
  with wk as (select public.rome_week() as start),
  g as (select * from public.my_valid_games() where (ended_at at time zone 'Europe/Rome')::date >= (select start from wk)),
  st as (
    select coalesce((stats ->> 'hands')::int, 0) hands, coalesce((stats ->> 'tricks')::int, 0) tricks,
           coalesce((stats ->> 'won')::int, 0) won, coalesce((stats ->> 'soc')::int, 0) soc,
           coalesce((stats ->> 'tris')::int, 0) tris, coalesce((stats ->> 'bestie')::int, 0) bestie
    from g where stats is not null
  ),
  m (metric, value) as (
    select 'games', count(*)::int from g
    union all select 'hands', coalesce(sum(hands), 0)::int from st
    union all select 'tricks', coalesce(sum(tricks), 0)::int from st
    union all select 'won', coalesce(sum(won), 0)::int from st
    union all select 'soc', coalesce(sum(soc), 0)::int from st
    union all select 'tris', coalesce(sum(tris), 0)::int from st
    union all select 'bestie', coalesce(sum(bestie), 0)::int from st
    union all select 'daily', count(distinct (at at time zone 'Europe/Rome')::date)::int from public.pack_openings
      where profile_id = auth.uid() and kind = 'giornaliera' and (at at time zone 'Europe/Rome')::date >= (select start from wk)
  )
  select d.id, coalesce((select m.value from m where m.metric = d.metric), 0), d.goal,
         exists (select 1 from public.weekly_claims c where c.profile_id = auth.uid() and c.week = (select start from wk) and c.challenge_id = d.id)
  from public.weekly_defs d
  where d.id = any (public.week_challenges((select start from wk)))
  order by array_position(public.week_challenges((select start from wk)), d.id);
$$;

-- ---------------------------------------------------------------- funzioni per l'app

-- Obiettivi, sfide della settimana e bustine vinte da aprire.
create or replace function public.my_goals()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare w public.wallets;
begin
  perform public.require_account();
  perform public.ensure_wallet();
  select * into w from public.wallets where profile_id = auth.uid();
  return jsonb_build_object(
    'achievements', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'value', value, 'goal', goal, 'claimed', claimed)) from public.my_achievement_rows()), '[]'::jsonb),
    'week', public.rome_week(),
    'challenges', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'value', value, 'goal', goal, 'claimed', claimed)) from public.my_weekly_rows()), '[]'::jsonb),
    'bonus_claimed', exists (select 1 from public.weekly_claims where profile_id = auth.uid() and week = public.rome_week() and challenge_id = 'bonus'),
    'coins', w.coins,
    'packs', jsonb_build_object('classica', w.pack_classica, 'oro', w.pack_oro)
  );
end $$;

-- Quanti premi aspettano di essere riscossi (per il pallino sulle bustine).
create or replace function public.goals_ready()
returns int
language sql stable security definer set search_path = public as $$
  with wk as (select * from public.my_weekly_rows())
  select (select count(*)::int from public.my_achievement_rows() where not claimed and value >= goal)
       + (select count(*)::int from wk where not claimed and value >= goal)
       + case when (select count(*) from wk where value >= goal) = 3
               and not exists (select 1 from public.weekly_claims where profile_id = auth.uid() and week = public.rome_week() and challenge_id = 'bonus')
              then 1 else 0 end;
$$;

-- Riscuote i premi indicati (id degli obiettivi, "w:<sfida>" per le sfide, "w:bonus" per la
-- bustina delle 3 sfide). Quelli non ancora raggiunti o già riscossi si ignorano.
create or replace function public.claim_goals(p_ids text[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_week date := public.rome_week();
  v_claimed text[] := '{}';
  w public.wallets;
begin
  perform public.require_account();
  perform public.ensure_wallet();
  perform 1 from public.wallets where profile_id = auth.uid() for update;

  for r in select * from public.my_achievement_rows() where id = any (p_ids) and not claimed and value >= goal loop
    insert into public.achievement_claims (profile_id, achievement_id) values (auth.uid(), r.id) on conflict do nothing;
    if found then
      update public.wallets set
        coins = coins + r.coins,
        pack_classica = pack_classica + case when r.pack = 'classica' then 1 else 0 end,
        pack_oro = pack_oro + case when r.pack = 'oro' then 1 else 0 end
      where profile_id = auth.uid();
      v_claimed := v_claimed || r.id;
    end if;
  end loop;

  for r in select * from public.my_weekly_rows() where 'w:' || id = any (p_ids) and not claimed and value >= goal loop
    insert into public.weekly_claims (profile_id, week, challenge_id) values (auth.uid(), v_week, r.id) on conflict do nothing;
    if found then
      update public.wallets set coins = coins + 40 where profile_id = auth.uid();
      v_claimed := v_claimed || ('w:' || r.id);
    end if;
  end loop;

  if 'w:bonus' = any (p_ids) and (select count(*) from public.my_weekly_rows() where value >= goal) = 3 then
    insert into public.weekly_claims (profile_id, week, challenge_id) values (auth.uid(), v_week, 'bonus') on conflict do nothing;
    if found then
      update public.wallets set pack_classica = pack_classica + 1 where profile_id = auth.uid();
      v_claimed := v_claimed || 'w:bonus'::text;
    end if;
  end if;

  select * into w from public.wallets where profile_id = auth.uid();
  return jsonb_build_object('claimed', to_jsonb(v_claimed), 'coins', w.coins, 'packs', jsonb_build_object('classica', w.pack_classica, 'oro', w.pack_oro));
end $$;

-- Come in 0009, più le bustine vinte e i premi da riscuotere.
create or replace function public.my_collection()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rewards jsonb;
  w public.wallets;
begin
  perform public.require_account();
  perform public.ensure_wallet();
  v_rewards := public.claim_game_rewards();
  select * into w from public.wallets where profile_id = auth.uid();
  return jsonb_build_object(
    'coins', w.coins,
    'welcome', not w.welcome_opened,
    'daily', w.last_daily is distinct from public.rome_today(),
    'items', coalesce((select jsonb_agg(item_id order by obtained_at) from public.owned_items where profile_id = auth.uid()), '[]'::jsonb),
    'rewards', v_rewards,
    'packs', jsonb_build_object('classica', w.pack_classica, 'oro', w.pack_oro),
    'goals_ready', public.goals_ready()
  );
end $$;

-- Come in 0009, ma una bustina classica o d'oro vinta con gli obiettivi si apre gratis (prima di
-- spendere gettoni). Rarità: comune 62%, rara 27%, epica 9%, leggendaria 2%.
create or replace function public.open_pack(p_kind text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ranks constant text[] := array['comune', 'rara', 'epica', 'leggendaria'];
  v_size int;
  v_price int;
  v_min text;
  w public.wallets;
  v_roll float;
  v_rarity text;
  v_item text;
  v_owned boolean;
  v_refund int;
  v_refunds int := 0;
  v_picked text[] := '{}';
  v_cards jsonb := '[]'::jsonb;
begin
  perform public.require_account();
  perform public.ensure_wallet();
  case p_kind
    when 'benvenuto' then v_size := 4; v_price := 0; v_min := 'rara';
    when 'giornaliera' then v_size := 2; v_price := 0;
    when 'classica' then v_size := 3; v_price := 120;
    when 'oro' then v_size := 5; v_price := 350; v_min := 'epica';
    else raise exception 'invalid_pack';
  end case;

  select * into w from public.wallets where profile_id = auth.uid() for update;
  if p_kind = 'benvenuto' then
    if w.welcome_opened then raise exception 'already_opened'; end if;
    update public.wallets set welcome_opened = true where profile_id = auth.uid();
  elsif p_kind = 'giornaliera' then
    if w.last_daily = public.rome_today() then raise exception 'daily_used'; end if;
    update public.wallets set last_daily = public.rome_today() where profile_id = auth.uid();
  elsif p_kind = 'classica' and w.pack_classica > 0 then
    update public.wallets set pack_classica = pack_classica - 1 where profile_id = auth.uid();
  elsif p_kind = 'oro' and w.pack_oro > 0 then
    update public.wallets set pack_oro = pack_oro - 1 where profile_id = auth.uid();
  else
    if w.coins < v_price then raise exception 'not_enough_coins'; end if;
    update public.wallets set coins = coins - v_price where profile_id = auth.uid();
  end if;

  for i in 1..v_size loop
    v_roll := random() * 100;
    v_rarity := case when v_roll < 2 then 'leggendaria' when v_roll < 11 then 'epica' when v_roll < 38 then 'rara' else 'comune' end;
    -- ultimo pezzo delle bustine con garanzia: si ritira tra le rarità ammesse, con gli stessi pesi
    if i = v_size and v_min is not null and array_position(ranks, v_rarity) < array_position(ranks, v_min) then
      v_roll := random() * (case v_min when 'rara' then 38 else 11 end);
      v_rarity := case when v_roll < 2 then 'leggendaria' when v_roll < 11 then 'epica' else 'rara' end;
    end if;

    select a.id into v_item from public.avatar_items a
      where a.active and a.rarity = v_rarity and not (a.id = any (v_picked))
      order by random() limit 1;
    -- colpo di fortuna: se lo hai già, si pesca ancora una volta
    if v_item is not null and exists (select 1 from public.owned_items where profile_id = auth.uid() and item_id = v_item) then
      select a.id into v_item from public.avatar_items a
        where a.active and a.rarity = v_rarity and not (a.id = any (v_picked))
        order by random() limit 1;
    end if;
    -- rarità esaurita in questa bustina: un pezzo qualsiasi
    if v_item is null then
      select a.id, a.rarity into v_item, v_rarity from public.avatar_items a
        where a.active and not (a.id = any (v_picked))
        order by random() limit 1;
    end if;
    exit when v_item is null;

    v_owned := exists (select 1 from public.owned_items where profile_id = auth.uid() and item_id = v_item);
    if v_owned then
      v_refund := case v_rarity when 'leggendaria' then 150 when 'epica' then 60 when 'rara' then 25 else 10 end;
      v_refunds := v_refunds + v_refund;
    else
      v_refund := 0;
      insert into public.owned_items (profile_id, item_id) values (auth.uid(), v_item);
    end if;
    v_picked := v_picked || v_item;
    v_cards := v_cards || jsonb_build_object('id', v_item, 'rarity', v_rarity, 'new', not v_owned, 'coins', v_refund);
  end loop;

  update public.wallets set coins = coins + v_refunds where profile_id = auth.uid() returning * into w;
  insert into public.pack_openings (profile_id, kind, cards) values (auth.uid(), p_kind, v_cards);
  return jsonb_build_object('cards', v_cards, 'coins', w.coins, 'packs', jsonb_build_object('classica', w.pack_classica, 'oro', w.pack_oro));
end $$;

-- ---------------------------------------------------------------- permessi

revoke all on public.achievement_defs, public.weekly_defs from anon;
grant select on public.achievement_defs, public.weekly_defs to authenticated;

revoke all on function public.my_valid_games() from public, anon, authenticated;
revoke all on function public.my_metrics() from public, anon, authenticated;
revoke all on function public.my_achievement_rows() from public, anon, authenticated;
revoke all on function public.my_weekly_rows() from public, anon, authenticated;
revoke all on function public.goals_ready() from public, anon, authenticated;
revoke all on function public.rome_week() from public, anon;
revoke all on function public.week_challenges(date) from public, anon;
revoke all on function public.games_missing_stats() from public, anon;
revoke all on function public.my_goals() from public, anon;
revoke all on function public.claim_goals(text[]) from public, anon;
revoke all on function public.my_collection() from public, anon;
revoke all on function public.open_pack(text) from public, anon;
grant execute on function public.rome_week() to authenticated;
grant execute on function public.week_challenges(date) to authenticated;
grant execute on function public.games_missing_stats() to authenticated;
grant execute on function public.my_goals() to authenticated;
grant execute on function public.claim_goals(text[]) to authenticated;
grant execute on function public.my_collection() to authenticated;
grant execute on function public.open_pack(text) to authenticated;
