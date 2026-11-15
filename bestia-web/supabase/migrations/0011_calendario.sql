-- Bestia: calendario dell'avvento.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0010_obiettivi.sql (vedi SUPABASE.md).
--
-- Dal 1° al 24 dicembre si apre una casella al giorno (ora italiana), in più alla bustina del
-- giorno. Le caselle dei giorni passati restano da aprire per tutto dicembre. Dentro ci sono
-- gettoni, un pezzo che non hai ancora, una bustina d'oro (6, 13, 20) e il 24 un leggendario.
-- Cosa c'è in ogni casella deve restare allineato con src/lib/advent.ts (advent.test.ts lo controlla).

-- ---------------------------------------------------------------- tabella

create table if not exists public.advent_openings (
  profile_id uuid not null references auth.users on delete cascade,
  season int not null,
  day int not null check (day between 1 and 24),
  reward jsonb not null,
  at timestamptz not null default now(),
  primary key (profile_id, season, day)
);

alter table public.advent_openings enable row level security;
drop policy if exists "calendario: il mio" on public.advent_openings;
create policy "calendario: il mio" on public.advent_openings for select to authenticated using (profile_id = auth.uid());
revoke insert, update, delete on public.advent_openings from authenticated, anon;

-- ---------------------------------------------------------------- caselle

-- Cosa c'è nella casella di un giorno: 'gettoni', 'pezzo', 'oro' o 'leggendario'.
create or replace function public.advent_kind(p_day int)
returns text
language sql immutable as $$
  select case
    when p_day = 24 then 'leggendario'
    when p_day in (6, 13, 20) then 'oro'
    when p_day in (1, 4, 9, 11, 16, 18, 22) then 'pezzo'
    else 'gettoni'
  end;
$$;

-- Gettoni delle caselle 'gettoni': tra 50 e 150, sempre gli stessi per tutti.
create or replace function public.advent_coins(p_day int)
returns int
language sql immutable as $$
  select 50 + mod(p_day * 37, 5) * 25;
$$;

-- L'ultima casella apribile oggi: 0 fuori da dicembre, poi il giorno (fino al 24).
create or replace function public.advent_today()
returns int
language sql stable set search_path = public as $$
  select case when extract(month from public.rome_today()) = 12 then least(24, extract(day from public.rome_today())::int) else 0 end;
$$;

-- Caselle che posso aprire adesso (per il pallino).
create or replace function public.advent_ready()
returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, public.advent_today() - (
    select count(*)::int from public.advent_openings
    where profile_id = auth.uid() and season = extract(year from public.rome_today())::int and day <= public.advent_today()
  ));
$$;

-- ---------------------------------------------------------------- funzioni per l'app

-- Il mio calendario: anno, ultima casella apribile e caselle già aperte con il loro premio.
create or replace function public.my_advent()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_account();
  return jsonb_build_object(
    'season', extract(year from public.rome_today())::int,
    'today', public.advent_today(),
    'opened', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'reward', reward) order by day) from public.advent_openings
      where profile_id = auth.uid() and season = extract(year from public.rome_today())::int
    ), '[]'::jsonb)
  );
end $$;

-- Apre la casella di un giorno. I pezzi escono tra quelli che non hai, con più probabilità per i
-- rari (comune 40, rara 35, epica 20, leggendaria 5); il 24 un leggendario che ti manca. Se non
-- manca più niente, gettoni al posto del pezzo.
create or replace function public.open_advent(p_day int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today int := public.advent_today();
  v_season int := extract(year from public.rome_today())::int;
  v_kind text;
  v_item text;
  v_rarity text;
  v_coins int := 0;
  v_reward jsonb;
  w public.wallets;
begin
  perform public.require_account();
  perform public.ensure_wallet();
  if v_today = 0 then raise exception 'advent_closed'; end if;
  if p_day is null or p_day < 1 or p_day > v_today then raise exception 'advent_locked'; end if;
  perform 1 from public.wallets where profile_id = auth.uid() for update;
  if exists (select 1 from public.advent_openings where profile_id = auth.uid() and season = v_season and day = p_day) then
    raise exception 'advent_opened';
  end if;

  v_kind := public.advent_kind(p_day);
  if v_kind = 'oro' then
    update public.wallets set pack_oro = pack_oro + 1 where profile_id = auth.uid();
    v_reward := jsonb_build_object('type', 'pack', 'pack', 'oro');
  elsif v_kind in ('pezzo', 'leggendario') then
    -- estrazione pesata: ogni pezzo mancante con peso secondo la rarità
    select a.id, a.rarity into v_item, v_rarity from public.avatar_items a
      where a.active
        and (v_kind = 'pezzo' or a.rarity = 'leggendaria')
        and not exists (select 1 from public.owned_items o where o.profile_id = auth.uid() and o.item_id = a.id)
      order by -ln(greatest(random(), 1e-9)) / (case a.rarity when 'leggendaria' then 5 when 'epica' then 20 when 'rara' then 35 else 40 end)
      limit 1;
    -- leggendari già tutti presi: il miglior pezzo che manca
    if v_item is null and v_kind = 'leggendario' then
      select a.id, a.rarity into v_item, v_rarity from public.avatar_items a
        where a.active and not exists (select 1 from public.owned_items o where o.profile_id = auth.uid() and o.item_id = a.id)
        order by array_position(array['leggendaria', 'epica', 'rara', 'comune'], a.rarity), random()
        limit 1;
    end if;
    if v_item is null then
      v_coins := case when v_kind = 'leggendario' then 300 else 150 end;
      v_reward := jsonb_build_object('type', 'coins', 'coins', v_coins);
    else
      insert into public.owned_items (profile_id, item_id) values (auth.uid(), v_item) on conflict do nothing;
      v_reward := jsonb_build_object('type', 'item', 'id', v_item, 'rarity', v_rarity);
    end if;
  else
    v_coins := public.advent_coins(p_day);
    v_reward := jsonb_build_object('type', 'coins', 'coins', v_coins);
  end if;

  update public.wallets set coins = coins + v_coins where profile_id = auth.uid() returning * into w;
  insert into public.advent_openings (profile_id, season, day, reward) values (auth.uid(), v_season, p_day, v_reward);
  return jsonb_build_object('day', p_day, 'reward', v_reward, 'coins', w.coins, 'packs', jsonb_build_object('classica', w.pack_classica, 'oro', w.pack_oro));
end $$;

-- Come in 0010, più le caselle del calendario da aprire.
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
    'goals_ready', public.goals_ready(),
    'advent_ready', public.advent_ready()
  );
end $$;

-- ---------------------------------------------------------------- permessi

revoke all on function public.advent_kind(int) from public, anon;
revoke all on function public.advent_coins(int) from public, anon;
revoke all on function public.advent_today() from public, anon;
revoke all on function public.advent_ready() from public, anon, authenticated;
revoke all on function public.my_advent() from public, anon;
revoke all on function public.open_advent(int) from public, anon;
revoke all on function public.my_collection() from public, anon;
grant execute on function public.advent_kind(int) to authenticated;
grant execute on function public.advent_coins(int) to authenticated;
grant execute on function public.advent_today() to authenticated;
grant execute on function public.my_advent() to authenticated;
grant execute on function public.open_advent(int) to authenticated;
grant execute on function public.my_collection() to authenticated;
