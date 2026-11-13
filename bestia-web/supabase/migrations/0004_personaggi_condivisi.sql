-- Bestia: i personaggi creati dal master si vedono anche su telefoni e TV.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0003_salvataggi_sicuri.sql (vedi SUPABASE.md).
-- Il master crea i personaggi dei giocatori sul suo dispositivo; qui ne tiene una copia per
-- partita, per nome del giocatore. La modifica è già riservata al master dalle regole di 0001
-- ("partita: modifica il master"), e la tabella delle partite è già nel tempo reale.

alter table public.games
  add column if not exists characters jsonb not null default '{}'::jsonb;

alter table public.games drop constraint if exists games_characters_check;
alter table public.games add constraint games_characters_check
  check (jsonb_typeof(characters) = 'object' and pg_column_size(characters) < 65536);
