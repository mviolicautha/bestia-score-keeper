-- Bestia: salvataggi sicuri anche con rete ballerina o due dispositivi del master.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0002_giocatori.sql (vedi SUPABASE.md).
-- Chi salva dichiara quanti eventi si aspetta che ci siano (p_expected): se nel frattempo
-- la partita è cambiata (un altro dispositivo del master ha già salvato, oppure un nuovo
-- tentativo dopo una risposta persa) il salvataggio viene rifiutato con 'conflict'
-- invece di registrare la stessa mano due volte.
-- L'app funziona anche prima di questo script (senza il controllo).

drop function if exists public.append_event(uuid, jsonb, text);
drop function if exists public.remove_last_event(uuid, text);

create or replace function public.append_event(p_game uuid, p_event jsonb, p_status text, p_expected int default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select event_count into v_count from public.games where id = p_game and master_id = auth.uid() for update;
  if v_count is null then raise exception 'not_master'; end if;
  if p_expected is not null and p_expected <> v_count then raise exception 'conflict'; end if;
  insert into public.game_events (game_id, seq, event) values (p_game, v_count + 1, p_event);
  update public.games set event_count = v_count + 1, status = p_status, updated_at = now() where id = p_game;
  return v_count + 1;
end $$;

create or replace function public.remove_last_event(p_game uuid, p_status text, p_expected int default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select event_count into v_count from public.games where id = p_game and master_id = auth.uid() for update;
  if v_count is null then raise exception 'not_master'; end if;
  if p_expected is not null and p_expected <> v_count then raise exception 'conflict'; end if;
  if v_count <= 1 then return; end if;
  delete from public.game_events where game_id = p_game and seq = v_count;
  update public.games set event_count = v_count - 1, status = p_status, updated_at = now() where id = p_game;
end $$;

revoke all on function public.append_event(uuid, jsonb, text, int) from public, anon;
revoke all on function public.remove_last_event(uuid, text, int) from public, anon;
grant execute on function public.append_event(uuid, jsonb, text, int) to authenticated;
grant execute on function public.remove_last_event(uuid, text, int) to authenticated;
