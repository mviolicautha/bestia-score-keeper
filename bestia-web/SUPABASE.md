# Collegare Bestia a Supabase

Con Supabase le partite sono online: la vista TV funziona da qualsiasi dispositivo e, nei
prossimi passi, i giocatori potranno unirsi dal proprio telefono. Senza Supabase l'app
continua a funzionare come prima, salvando tutto sul dispositivo del master.

Ci vogliono circa 10 minuti. Il piano gratuito basta.

## 1. Crea il progetto
1. Vai su [supabase.com](https://supabase.com), accedi e premi **New project**.
2. Nome: `bestia`. Regione: **Central EU (Frankfurt)**, la più vicina all'Italia.
3. Scegli una password per il database e salvala da qualche parte: all'app non serve, ma potrebbe servire a te.
4. Aspetta un paio di minuti che il progetto sia pronto.

## 2. Permetti l'accesso come ospite
I giocatori entrano senza registrarsi, come "ospiti anonimi".

**Authentication → Sign In / Providers** → attiva **Allow anonymous sign-ins** → **Save**.

## 3. Crea le tabelle
1. Apri **SQL Editor** → **New query**.
2. Incolla tutto il contenuto di [`supabase/migrations/0001_partite.sql`](supabase/migrations/0001_partite.sql).
3. Premi **Run**. Deve comparire *Success. No rows returned*.

Lo script crea partite, eventi, posti e richieste per unirsi, insieme alle regole di
sicurezza: solo il master scrive la sua partita, tutti gli altri possono solo leggerla.

## 4. Copia URL e chiave pubblica
Vai in **Project Settings → API Keys** (o **Data API**) e copia:
- **Project URL**, del tipo `https://abcdefgh.supabase.co`;
- la chiave **publishable** (`sb_publishable_…`). Se il progetto mostra le chiavi "legacy", va bene anche la chiave **anon**.

Queste due informazioni sono pubbliche per natura: finiscono comunque nel codice che il browser scarica, e a
proteggere i dati sono le regole del passo 3. **Non copiare mai la chiave `service_role` / `secret`.**

## 5. Inseriscile nell'app
Puoi mandarle in chat a Claude, oppure fare da solo:
1. In `bestia-web`, copia `.env.example` in un nuovo file `.env.local`.
2. Incolla i due valori:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
   ```
3. Riavvia il server di sviluppo (`npm run dev`).

`.env.local` resta solo sul tuo computer: non va su git.

## Da sapere
- **Le partite salvate in locale non vengono trasferite**: con Supabase attivo l'app parte con l'elenco vuoto.
- **Chi è il master**: il dispositivo, cioè l'utente ospite, che crea la partita. Se cambi telefono o cancelli i dati
  del browser, perdi il ruolo di master sulle partite vecchie. Lo risolveremo con gli account, che permetteranno di
  collegare email, Google o Apple all'utente ospite.
- **Per usarla durante una serata** l'app va pubblicata online, per esempio su Vercel (gratuito). Oggi il server di
  sviluppo si raggiunge solo dalla stessa rete Wi-Fi.
