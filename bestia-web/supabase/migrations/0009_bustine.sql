-- Bestia: bustine, gettoni e album dei pezzi del personaggio.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0008_storico.sql (vedi SUPABASE.md).
--
-- I capelli sono liberi per tutti; ogni altro pezzo del personaggio si sblocca trovandolo in una
-- bustina. Le bustine si aprono gratis (una di benvenuto, una al giorno) o si comprano con i
-- gettoni, che si guadagnano giocando: a ogni partita terminata (come giocatore o come master)
-- e un po' di più se si chiude in attivo.
--
-- Cosa esce lo decide il database (open_pack), così nessuno può scegliersi i pezzi dal browser.
-- Prezzi, dimensioni e rarità devono restare allineati con src/lib/avatar/packs.ts e rarity.json.
-- Chi aveva già un personaggio tiene i pezzi che indossava: finiscono nel suo album la prima
-- volta che lo apre.

-- ---------------------------------------------------------------- tabelle

-- I pezzi da collezionare (i capelli no: sono liberi). `npm run avatar:sql` rigenera l'elenco.
create table if not exists public.avatar_items (
  id text primary key,
  category text not null,
  rarity text not null check (rarity in ('comune', 'rara', 'epica', 'leggendaria')),
  active boolean not null default true
);

create table if not exists public.wallets (
  profile_id uuid primary key references auth.users on delete cascade,
  coins int not null default 0 check (coins >= 0),
  welcome_opened boolean not null default false,
  last_daily date,
  created_at timestamptz not null default now()
);

create table if not exists public.owned_items (
  profile_id uuid not null references auth.users on delete cascade,
  item_id text not null references public.avatar_items on delete cascade,
  obtained_at timestamptz not null default now(),
  primary key (profile_id, item_id)
);

-- Gettoni già dati per una partita: una volta sola per persona, anche se la partita si riapre.
create table if not exists public.game_rewards (
  game_id uuid not null references public.games on delete cascade,
  profile_id uuid not null references auth.users on delete cascade,
  coins int not null,
  at timestamptz not null default now(),
  primary key (game_id, profile_id)
);

create table if not exists public.pack_openings (
  id bigint generated always as identity primary key,
  profile_id uuid not null references auth.users on delete cascade,
  kind text not null,
  cards jsonb not null,
  at timestamptz not null default now()
);
create index if not exists pack_openings_profile on public.pack_openings (profile_id, at desc);

-- Dal browser si legge soltanto (e solo il proprio): si scrive con le funzioni qui sotto.
alter table public.avatar_items enable row level security;
alter table public.wallets enable row level security;
alter table public.owned_items enable row level security;
alter table public.game_rewards enable row level security;
alter table public.pack_openings enable row level security;

drop policy if exists "pezzi: tutti" on public.avatar_items;
create policy "pezzi: tutti" on public.avatar_items for select to authenticated using (true);
drop policy if exists "portafoglio: il mio" on public.wallets;
create policy "portafoglio: il mio" on public.wallets for select to authenticated using (profile_id = auth.uid());
drop policy if exists "album: il mio" on public.owned_items;
create policy "album: il mio" on public.owned_items for select to authenticated using (profile_id = auth.uid());
drop policy if exists "premi: i miei" on public.game_rewards;
create policy "premi: i miei" on public.game_rewards for select to authenticated using (profile_id = auth.uid());
drop policy if exists "bustine: le mie" on public.pack_openings;
create policy "bustine: le mie" on public.pack_openings for select to authenticated using (profile_id = auth.uid());

revoke insert, update, delete on public.avatar_items, public.wallets, public.owned_items, public.game_rewards, public.pack_openings
  from authenticated, anon;

-- ---------------------------------------------------------------- pezzi

insert into public.avatar_items (id, category, rarity) values
  ('back_angry_girls', 'back', 'epica'),
  ('back_aura', 'back', 'leggendaria'),
  ('back_curioso', 'back', 'rara'),
  ('back_dragon', 'back', 'epica'),
  ('back_dragon_wings', 'back', 'leggendaria'),
  ('back_fairy_wings', 'back', 'epica'),
  ('back_gabrosa', 'back', 'rara'),
  ('back_girls', 'back', 'rara'),
  ('back_lgbt_flag', 'back', 'rara'),
  ('back_ludopatia', 'back', 'leggendaria'),
  ('back_smooth', 'back', 'rara'),
  ('back_with_the_guys', 'back', 'epica'),
  ('outfit_apron_abs', 'outfit', 'epica'),
  ('outfit_bandit', 'outfit', 'rara'),
  ('outfit_bellagianda', 'outfit', 'rara'),
  ('outfit_bomber', 'outfit', 'comune'),
  ('outfit_ce', 'outfit', 'rara'),
  ('outfit_cortona_camucia', 'outfit', 'rara'),
  ('outfit_esqueleto', 'outfit', 'epica'),
  ('outfit_grandma', 'outfit', 'comune'),
  ('outfit_homeless', 'outfit', 'comune'),
  ('outfit_milo', 'outfit', 'rara'),
  ('outfit_muscles', 'outfit', 'epica'),
  ('outfit_nostalgia', 'outfit', 'comune'),
  ('outfit_palermo', 'outfit', 'rara'),
  ('outfit_polo_white', 'outfit', 'comune'),
  ('outfit_random', 'outfit', 'comune'),
  ('outfit_suit', 'outfit', 'comune'),
  ('outfit_tecno_camicia', 'outfit', 'comune'),
  ('outfit_tecno_outfit', 'outfit', 'epica'),
  ('outfit_tshirt', 'outfit', 'comune'),
  ('outfit_tshirt_iqos', 'outfit', 'rara'),
  ('outfit_tunica', 'outfit', 'rara'),
  ('outfit_vest', 'outfit', 'comune'),
  ('facial_beard_short', 'facial', 'comune'),
  ('facial_mustache_big', 'facial', 'comune'),
  ('mouth_albania', 'mouth', 'rara'),
  ('mouth_cigarette', 'mouth', 'comune'),
  ('glasses_aviator_orange', 'glasses', 'rara'),
  ('glasses_orange', 'glasses', 'comune'),
  ('glasses_sun_black', 'glasses', 'comune'),
  ('glasses_veloci', 'glasses', 'rara'),
  ('hat_bandana_green', 'hat', 'comune'),
  ('hat_bauli', 'hat', 'rara'),
  ('hat_cap_camo', 'hat', 'comune'),
  ('hat_cappello_gnomo', 'hat', 'rara'),
  ('hat_carbon_helmet', 'hat', 'epica'),
  ('hat_chicken', 'hat', 'epica'),
  ('hat_clam_closed', 'hat', 'rara'),
  ('hat_clam_open', 'hat', 'rara'),
  ('hat_cowboy', 'hat', 'rara'),
  ('hat_crazy', 'hat', 'rara'),
  ('hat_d', 'hat', 'comune'),
  ('hat_finanziere', 'hat', 'rara'),
  ('hat_flat_cap', 'hat', 'comune'),
  ('hat_funny', 'hat', 'comune'),
  ('hat_helmet_bike', 'hat', 'comune'),
  ('hat_helmet_moto', 'hat', 'comune'),
  ('hat_jellyfish', 'hat', 'epica'),
  ('hat_jiad', 'hat', 'rara'),
  ('hat_military_helmet', 'hat', 'comune'),
  ('hat_muratozoo', 'hat', 'epica'),
  ('hat_nido', 'hat', 'epica'),
  ('hat_pumpkin', 'hat', 'rara'),
  ('hat_santa', 'hat', 'rara'),
  ('hat_shark', 'hat', 'epica'),
  ('hat_sombrero', 'hat', 'rara'),
  ('hat_strange', 'hat', 'rara'),
  ('hat_straw_hat', 'hat', 'comune'),
  ('costume_book_of_ra', 'costume', 'leggendaria'),
  ('costume_gnomo', 'costume', 'epica'),
  ('costume_hoodie', 'costume', 'rara'),
  ('costume_lupo_lucio', 'costume', 'leggendaria'),
  ('costume_nun', 'costume', 'epica'),
  ('costume_olianti', 'costume', 'epica'),
  ('extra_black_scooter_poseidon', 'extra', 'leggendaria'),
  ('extra_e_scooter', 'extra', 'epica'),
  ('extra_pig', 'extra', 'leggendaria')
on conflict (id) do update set category = excluded.category, rarity = excluded.rarity, active = true;

-- i pezzi tolti dal catalogo non escono più dalle bustine (chi li ha li tiene)
update public.avatar_items set active = false
  where id not in ('back_angry_girls', 'back_aura', 'back_curioso', 'back_dragon', 'back_dragon_wings', 'back_fairy_wings', 'back_gabrosa', 'back_girls', 'back_lgbt_flag', 'back_ludopatia', 'back_smooth', 'back_with_the_guys', 'outfit_apron_abs', 'outfit_bandit', 'outfit_bellagianda', 'outfit_bomber', 'outfit_ce', 'outfit_cortona_camucia', 'outfit_esqueleto', 'outfit_grandma', 'outfit_homeless', 'outfit_milo', 'outfit_muscles', 'outfit_nostalgia', 'outfit_palermo', 'outfit_polo_white', 'outfit_random', 'outfit_suit', 'outfit_tecno_camicia', 'outfit_tecno_outfit', 'outfit_tshirt', 'outfit_tshirt_iqos', 'outfit_tunica', 'outfit_vest', 'facial_beard_short', 'facial_mustache_big', 'mouth_albania', 'mouth_cigarette', 'glasses_aviator_orange', 'glasses_orange', 'glasses_sun_black', 'glasses_veloci', 'hat_bandana_green', 'hat_bauli', 'hat_cap_camo', 'hat_cappello_gnomo', 'hat_carbon_helmet', 'hat_chicken', 'hat_clam_closed', 'hat_clam_open', 'hat_cowboy', 'hat_crazy', 'hat_d', 'hat_finanziere', 'hat_flat_cap', 'hat_funny', 'hat_helmet_bike', 'hat_helmet_moto', 'hat_jellyfish', 'hat_jiad', 'hat_military_helmet', 'hat_muratozoo', 'hat_nido', 'hat_pumpkin', 'hat_santa', 'hat_shark', 'hat_sombrero', 'hat_strange', 'hat_straw_hat', 'costume_book_of_ra', 'costume_gnomo', 'costume_hoodie', 'costume_lupo_lucio', 'costume_nun', 'costume_olianti', 'extra_black_scooter_poseidon', 'extra_e_scooter', 'extra_pig');

-- ---------------------------------------------------------------- funzioni di servizio

-- Il "giorno" della bustina gratis: a mezzanotte italiana se ne apre un'altra.
create or replace function public.rome_today()
returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Europe/Rome')::date;
$$;

-- Crea il portafoglio la prima volta e mette nell'album i pezzi che si indossavano già.
create or replace function public.ensure_wallet()
returns void
language plpgsql security definer set search_path = public as $$
declare v_char jsonb;
begin
  insert into public.wallets (profile_id) values (auth.uid()) on conflict do nothing;
  if found then
    select character into v_char from public.profiles where id = auth.uid();
    if jsonb_typeof(v_char) = 'object' then
      insert into public.owned_items (profile_id, item_id)
        select auth.uid(), a.id from public.avatar_items a
        where a.id in (select value from jsonb_each_text(v_char))
        on conflict do nothing;
    end if;
  end if;
end $$;

-- Gettoni delle partite terminate negli ultimi 30 giorni non ancora premiate (al massimo 6 al
-- giorno): 50 a partita, più un gettone ogni 10 centesimi vinti (fino a 50) se si chiude in attivo.
-- Valgono le partite giocate (dal posto preso o dal membro della compagnia) e quelle condotte;
-- servono almeno due giocatori e almeno due mani.
create or replace function public.claim_game_rewards()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_left int;
  v_out jsonb := '[]'::jsonb;
  v_coins int;
  r record;
begin
  select 6 - count(*) into v_left from public.game_rewards
    where profile_id = auth.uid() and (at at time zone 'Europe/Rome')::date = public.rome_today();
  if v_left <= 0 then return v_out; end if;
  for r in
    with mine as (
      select res.game_id, res.balance_cents
      from public.game_results res
      where exists (select 1 from public.game_seats s where s.game_id = res.game_id and s.player_id = res.player_id and s.profile_id = auth.uid())
         or exists (
           select 1 from public.game_players gp join public.group_members m on m.id = gp.member_id
           where gp.game_id = res.game_id and gp.player_id = res.player_id and m.profile_id = auth.uid()
         )
    )
    select g.id, g.title, (select max(mine.balance_cents) from mine where mine.game_id = g.id) as balance
    from public.games g
    where g.status = 'ended'
      and g.updated_at > now() - interval '30 days'
      and g.event_count >= 3
      and (g.master_id = auth.uid() or g.id in (select game_id from mine))
      and (select count(*) from public.game_results x where x.game_id = g.id) >= 2
      and not exists (select 1 from public.game_rewards w where w.game_id = g.id and w.profile_id = auth.uid())
    order by g.updated_at
    limit v_left
  loop
    v_coins := 50 + case when coalesce(r.balance, 0) > 0 then least(50, r.balance / 10) else 0 end;
    insert into public.game_rewards (game_id, profile_id, coins) values (r.id, auth.uid(), v_coins) on conflict do nothing;
    if found then
      update public.wallets set coins = coins + v_coins where profile_id = auth.uid();
      v_out := v_out || jsonb_build_object('game_id', r.id, 'title', r.title, 'coins', v_coins);
    end if;
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------- funzioni per l'app

-- Il mio album: gettoni, bustine gratis disponibili, pezzi posseduti e gettoni appena guadagnati.
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
    'rewards', v_rewards
  );
end $$;

-- Apre una bustina: 'benvenuto' (gratis, una volta, 4 pezzi, almeno un raro), 'giornaliera'
-- (gratis, una al giorno, 2 pezzi), 'classica' (120 gettoni, 3 pezzi) o 'oro' (350 gettoni,
-- 5 pezzi, almeno un epico). Rarità: comune 62%, rara 27%, epica 9%, leggendaria 2%.
-- Se esce un pezzo che si ha già si pesca ancora una volta; se è di nuovo un doppione diventa
-- gettoni (10 / 25 / 60 / 150 secondo la rarità).
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
  return jsonb_build_object('cards', v_cards, 'coins', w.coins);
end $$;

revoke all on function public.rome_today() from public, anon;
revoke all on function public.ensure_wallet() from public, anon, authenticated;
revoke all on function public.claim_game_rewards() from public, anon, authenticated;
revoke all on function public.my_collection() from public, anon;
revoke all on function public.open_pack(text) from public, anon;
grant execute on function public.rome_today() to authenticated;
grant execute on function public.my_collection() to authenticated;
grant execute on function public.open_pack(text) to authenticated;
