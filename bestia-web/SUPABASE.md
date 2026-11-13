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

Poi, sempre nel SQL Editor, esegui anche gli altri script in [`supabase/migrations/`](supabase/migrations/),
**in ordine e una volta sola**:
- `0002_giocatori.sql` (una riga): i personaggi che i giocatori creano sul proprio telefono compaiono subito su master e TV;
- `0003_salvataggi_sicuri.sql`: con la rete ballerina o con la partita aperta su due dispositivi del master, una mano
  non viene mai registrata due volte (l'app funziona anche senza, ma senza questo controllo).
- `0004_personaggi_condivisi.sql`: i personaggi creati sul telefono del master si vedono anche sui telefoni dei giocatori
  e sulla TV (senza, li vede solo il master).
- `0005_account.sql`: account con username e password (vedi il passo 6), e "Elimina account" che non cancella le
  partite condotte da master.
- `0006_compagnie.sql`: compagnie di amici con codice invito, membri (anche ospiti senza account) e amministratori.
- `0007_partite_compagnie.sql`: partite dentro le compagnie, giocatori legati ai membri, e partite non più leggibili da
  chiunque (solo master, membri della compagnia, chi è seduto o chi l'ha aperta con codice/link). Va eseguito **dopo**
  che il sito pubblicato ha la versione dell'app che lo conosce: le versioni precedenti non trovano più le partite
  degli altri dal codice.
- `0008_storico.sql`: risultati salvati a fine partita, "Le mie partite" e import delle partite fatte in locale.

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

## 6. Account con username e password
Gli account non usano email vere: l'app ricava dall'username un indirizzo finto (`nome@giocatori.bestia-score-keeper.vercel.app`)
che non riceve posta. Perché funzioni, Supabase non deve chiedere di confermarlo:

**Authentication → Sign In / Providers → Email** → spegni **Confirm email** → **Save**.

Se resta acceso, la registrazione si ferma con un messaggio che rimanda qui (e Supabase proverebbe a spedire una mail
all'indirizzo finto).

**Password dimenticata**: chi è ancora collegato sul suo telefono la cambia dal profilo, senza quella vecchia.
Altrimenti la reimposti tu dal **SQL Editor** (non usare "Send password recovery" della dashboard: manderebbe una mail
all'indirizzo finto). Sostituisci username e password temporanea, esegui, comunicagliela: poi la cambierà dal profilo.
```sql
update auth.users
   set encrypted_password = extensions.crypt('password-temporanea', extensions.gen_salt('bf'))
 where email = 'username@giocatori.bestia-score-keeper.vercel.app';
```
Deve rispondere *Success. 1 row affected*; con 0 righe l'username è scritto male.

## Prima di una serata
- **Pausa del progetto**: nel piano gratuito Supabase mette in pausa i progetti dopo una settimana senza attività.
  Il sito su Vercel chiama ogni mattina `/api/keepalive` (vedi `vercel.json`), che fa una lettura leggera e lo tiene
  sveglio. Se comunque trovi il progetto in pausa, lo riattivi dalla dashboard di Supabase (**Restore**).
- **Accessi ospite**: Supabase limita gli accessi anonimi a 30 all'ora per indirizzo IP. Con il Wi-Fi di casa tutti i
  telefoni escono con lo stesso indirizzo: per una serata normale basta, ma se serve si alza in
  **Authentication → Rate Limits** (voce degli accessi anonimi).

## Da sapere
- **Le partite salvate in locale non vengono trasferite**: con Supabase attivo l'app parte con l'elenco vuoto.
- **Chi è il master**: l'utente che crea la partita. Senza account è l'ospite anonimo del telefono: se cambi telefono o
  cancelli i dati del browser, perdi il ruolo di master sulle partite vecchie. Con un account (passo 6) le ritrovi
  entrando con username e password da qualsiasi dispositivo.
- **Per usarla durante una serata** l'app va pubblicata online, per esempio su Vercel (gratuito). Oggi il server di
  sviluppo si raggiunge solo dalla stessa rete Wi-Fi.
