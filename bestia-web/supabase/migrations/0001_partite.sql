-- Bestia: partite condivise in tempo reale.
--
-- Da eseguire una volta nel SQL Editor del progetto Supabase (vedi SUPABASE.md).
-- Modello: la partita è la sequenza dei suoi eventi (come nell'app locale). Solo il
-- master scrive gli eventi, tramite funzioni che controllano chi è; tutti gli utenti
-- collegati (anche ospiti anonimi) possono leggere una partita di cui conoscono id o codice.

-- ---------------------------------------------------------------- tabelle

-- Un profilo per utente (ospite anonimo o registrato): nome e personaggio.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text check (display_name is null or char_length(trim(display_name)) between 1 and 20),
  character jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  -- codice breve da dettare o inquadrare (QR) per unirsi
  code text not null unique,
  title text not null check (char_length(title) between 1 and 60),
  master_id uuid not null default auth.uid() references auth.users on delete cascade,
  status text not null default 'in_progress' check (status in ('not_started', 'in_progress', 'ended')),
  event_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists games_master_idx on public.games (master_id, updated_at desc);

create table if not exists public.game_events (
  game_id uuid not null references public.games on delete cascade,
  seq int not null check (seq >= 1),
  event jsonb not null,
  at timestamptz not null default now(),
  primary key (game_id, seq)
);

-- "Sono io": un giocatore della partita (id del motore) preso da un profilo.
create table if not exists public.game_seats (
  game_id uuid not null references public.games on delete cascade,
  player_id text not null,
  profile_id uuid not null default auth.uid() references auth.users on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (game_id, player_id),
  unique (game_id, profile_id)
);

-- "Chiedo di sedermi": il master approva e sceglie il posto.
create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games on delete cascade,
  profile_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 20),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  player_id text,
  created_at timestamptz not null default now()
);
create index if not exists join_requests_game_idx on public.join_requests (game_id, status);

-- ---------------------------------------------------------------- sicurezza (RLS)

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_events enable row level security;
alter table public.game_seats enable row level security;
alter table public.join_requests enable row level security;

-- profili: tutti vedono nomi e personaggi, ognuno modifica il suo
create policy "profili leggibili" on public.profiles for select to authenticated using (true);
create policy "profilo proprio: crea" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profilo proprio: modifica" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- partite: leggibili da chi è collegato; crea/modifica/cancella solo il master
create policy "partite leggibili" on public.games for select to authenticated using (true);
create policy "partita: modifica il master" on public.games for update to authenticated using (master_id = auth.uid()) with check (master_id = auth.uid());
create policy "partita: cancella il master" on public.games for delete to authenticated using (master_id = auth.uid());
-- (la creazione passa da create_game)

-- eventi: leggibili; si scrivono solo con append_event / remove_last_event
create policy "eventi leggibili" on public.game_events for select to authenticated using (true);

-- posti presi: leggibili; ognuno prende/lascia il suo, il master può liberarli
create policy "posti leggibili" on public.game_seats for select to authenticated using (true);
create policy "posto: prendo il mio" on public.game_seats for insert to authenticated with check (profile_id = auth.uid());
create policy "posto: libero il mio o il master" on public.game_seats for delete to authenticated using (
  profile_id = auth.uid() or exists (select 1 from public.games g where g.id = game_id and g.master_id = auth.uid())
);

-- richieste: le vede chi le fa e il master; le crea chi chiede; le gestisce il master
create policy "richieste: mie o del mio tavolo" on public.join_requests for select to authenticated using (
  profile_id = auth.uid() or exists (select 1 from public.games g where g.id = game_id and g.master_id = auth.uid())
);
create policy "richieste: chiedo io" on public.join_requests for insert to authenticated with check (profile_id = auth.uid() and status = 'pending');
create policy "richieste: decide il master" on public.join_requests for update to authenticated using (
  exists (select 1 from public.games g where g.id = game_id and g.master_id = auth.uid())
);

-- ---------------------------------------------------------------- funzioni

-- Crea la partita con un codice breve univoco e il primo evento (game_started).
create or replace function public.create_game(p_title text, p_base_bet_cents int)
returns public.games
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- niente 0/O, 1/I
  v_code text;
  v_game public.games;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.games where code = v_code);
  end loop;
  insert into public.games (code, title, master_id, event_count)
    values (v_code, p_title, auth.uid(), 1) returning * into v_game;
  insert into public.game_events (game_id, seq, event)
    values (v_game.id, 1, jsonb_build_object('type', 'game_started', 'baseBetCents', p_base_bet_cents));
  return v_game;
end $$;

-- Aggiunge un evento in coda (solo il master). L'evento è già stato validato dal motore
-- nell'app; qui si garantisce l'ordine anche con due dispositivi del master aperti.
create or replace function public.append_event(p_game uuid, p_event jsonb, p_status text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_seq int;
begin
  update public.games set event_count = event_count + 1, status = p_status, updated_at = now()
    where id = p_game and master_id = auth.uid()
    returning event_count into v_seq;
  if v_seq is null then raise exception 'not_master'; end if;
  insert into public.game_events (game_id, seq, event) values (p_game, v_seq, p_event);
  return v_seq;
end $$;

-- Annulla: toglie l'ultimo evento (mai l'avvio della partita).
create or replace function public.remove_last_event(p_game uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select event_count into v_count from public.games where id = p_game and master_id = auth.uid() for update;
  if v_count is null then raise exception 'not_master'; end if;
  if v_count <= 1 then return; end if;
  delete from public.game_events where game_id = p_game and seq = v_count;
  update public.games set event_count = v_count - 1, status = p_status, updated_at = now() where id = p_game;
end $$;

revoke all on function public.create_game(text, int) from public, anon;
revoke all on function public.append_event(uuid, jsonb, text) from public, anon;
revoke all on function public.remove_last_event(uuid, text) from public, anon;
grant execute on function public.create_game(text, int) to authenticated;
grant execute on function public.append_event(uuid, jsonb, text) to authenticated;
grant execute on function public.remove_last_event(uuid, text) to authenticated;

-- ---------------------------------------------------------------- tempo reale

-- Ogni evento aggiorna la riga della partita: chi guarda (TV, giocatori) ascolta quella.
alter publication supabase_realtime add table public.games, public.game_seats, public.join_requests;
