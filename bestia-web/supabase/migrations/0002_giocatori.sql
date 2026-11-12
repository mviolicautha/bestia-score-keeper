-- Bestia: giocatori dal proprio telefono.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0001_partite.sql (vedi SUPABASE.md).
-- Il personaggio che un giocatore crea sul suo telefono sta nel suo profilo: master e TV
-- devono vederlo cambiare in tempo reale.
alter publication supabase_realtime add table public.profiles;
