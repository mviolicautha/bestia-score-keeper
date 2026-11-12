# Bestia (web)

Segnapunti per la Bestia come web app: funziona su iPhone, Android e PC dal browser
(e si può aggiungere alla schermata Home). È l'evoluzione dell'app Flutter che sta
nella cartella superiore.

## Avvio

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # tutti i test: motore, serate casuali, interfaccia (master, TV, home)
npm run build   # build di produzione
```

Per le partite online (vista TV da qualsiasi dispositivo, giocatori dal telefono) vedi [SUPABASE.md](SUPABASE.md):
senza configurazione l'app salva tutto in locale.

## Struttura

| Cartella | Cosa contiene |
|---|---|
| `src/engine/` | **Motore di gioco puro** (TypeScript, nessuna dipendenza): regole, soldi in centesimi, statistiche, "chi paga chi". Coperto da test. Riutilizzabile anche in un'app nativa. |
| `src/lib/repository.ts` | Salvataggio delle partite. Oggi in `localStorage`; domani una seconda implementazione con Supabase, stessa interfaccia. |
| `src/lib/useGame.ts` | Hook React: carica la partita, valida ogni azione con il motore, gestisce annulla. |
| `src/app/page.tsx` | Elenco partite e creazione. |
| `src/app/partita/[id]/` | Schermata del master: giocatori, passa, gioca mano (vincitori → bestie), società, messa, cronologia, fine partita. |
| `src/app/tv/[id]/` | Vista da proiettare: classifica, andamento, piatto, ultime mani; a fine partita mostra chi paga chi. |
| `src/app/g/[code]/` | Pagina che si apre dal QR del master: "Sono io" (prendo il posto di un giocatore) o "Chiedo di sedermi" (solo online). |
| `src/app/gioca/[id]/` | Vista del giocatore sul proprio telefono: saldo, avvisi (tocca a te fare le carte, ultima mano), tavolo, conti finali personali. |
| `src/lib/online.ts` | Posti presi, richieste di sedersi e profili su Supabase; `useOnline.ts` li tiene aggiornati in tempo reale. |
| `src/lib/avatar/` | Personaggi dei giocatori: `catalog.json` (generato da `../avatar-pipeline`, non modificarlo a mano), regole di composizione (`catalog.ts`) e salvataggio per nome (`store.ts`). |
| `src/components/Character*.tsx` | Disegno del personaggio a livelli sovrapposti ed editor (scheda giocatore → "Crea personaggio"). |
| `public/avatars/` | Immagini dei pezzi (generate da `npm run export` in `../avatar-pipeline`). |

## Come funziona il motore

La partita è una **sequenza di eventi** (`game_started`, `player_added`, `player_left`,
`bet_changed`, `hand_passed`, `hand_played`, `game_ended`). Lo stato si ottiene
rigiocandoli con `replay()`. Ne derivano:

- annulla illimitato (si toglie l'ultimo evento, anche dopo aver chiuso il browser);
- statistiche esatte (non si leggono più i testi dei log);
- in futuro la stessa sequenza salvata sul database alimenta vista TV, storico e debiti.

I posti seguono il giro del tavolo in senso orario, che è l'ordine in cui passa il mazzo. Chi arriva a partita
iniziata sceglie dopo chi sedersi (`seatAfter` in `player_added`); si entra e si esce solo a piatto pulito
("sbestiati") e senza superare il massimo dei giocatori. Ogni giocatore tiene il suo colore per tutta la serata.

Regole riprese dall'app Flutter: minimo 5 / massimo 10 giocatori (configurabili),
messa divisibile in 3 parti, tavolo e messa modificabili solo a piatto pulito,
vincite 3/3, 2/3 + 1/3 o 1/3 a testa, ogni bestia paga l'intero piatto, le società
dividono vincite e penalità. I centesimi indivisibili vanno ai primi in ordine di posto.

## Prossimi passi

1. **Supabase**: database, login, aggiornamenti in tempo reale → vista TV da qualsiasi dispositivo, solo il master scrive.
2. Inviti e guest (con possibilità di rivendicare il profilo guest).
3. Storico personale e statistiche.
4. Registro debiti stile Splitwise con chiusura dei debiti.
5. PWA installabile e, se servirà, app nativa con Capacitor.
