# Pipeline avatar di Bestia

Trasforma le immagini generate con Nano Banana in **livelli PNG trasparenti, già allineati**, che l'app sovrappone per comporre il personaggio al tavolo.

```
Nano Banana → Downloads/Assets/<categoria>_<nome>.jpg → npm run build → npm run export → app (bestia-web)
```

---

## Aggiungere un asset in 5 passi

### 1. Genera l'immagine in Nano Banana
Allega **sempre** la base `body.jpg` (calvo, maglietta grigia, sfondo magenta) e usa questo prompt, cambiando solo la parte tra parentesi:

```
Use the attached image as the exact base. Keep the character, pose, framing, camera angle, lighting, face, expression, t-shirt and the pure flat magenta background (#FF00FF) completely identical, pixel-aligned. Only add: [OGGETTO]. Change nothing else. Do not change the lighting or shading of the face. No cast shadows on the face. Same render style and materials.
```

Aggiunte a seconda della categoria:

| Categoria | Cosa aggiungere al prompt |
|---|---|
| `hair` | `medium brown hair. Keep the eyebrows exactly as they are.` (castano medio: il colore lo cambia l'app) |
| `outfit` | al posto di "Only add": `Only replace the grey t-shirt with: [VESTITO]. Keep the neck, arms and skin identical.` |
| `hat` | niente di speciale; genera sempre sulla testa calva |
| oggetti larghi | `fully visible inside the frame` (cappelli grandi, ali, veicoli) |

**Prima di scaricarla controlla che:**
- lo sfondo sia ancora magenta pieno e la posa identica;
- non sia sparito un pezzo del personaggio (orecchie, collo, braccia). Un livello può solo *aggiungere*, non cancellare;
- l'oggetto non esca dai bordi dell'immagine.

### 2. Dagli il nome giusto e mettilo nella cartella
Salva il file in `C:\Users\matte\Downloads\Assets` con nome **`categoria_nome.jpg`**, tutto minuscolo, senza spazi. Esempi: `hair_afro.jpg`, `hat_top_hat.jpg`, `outfit_hawaiian.jpg`.

La categoria è la parola prima del primo `_`:

| Categoria | Cos'è | Dove viene disegnata |
|---|---|---|
| `back` | dietro il personaggio (ali, mantelli, zaini) | sotto a tutto |
| `outfit` | vestiti e magliette | sopra il corpo |
| `facial` | barba e baffi | sopra il vestito |
| `mouth` | in bocca (sigaretta, lecca-lecca, fischietto) | sopra barba e baffi |
| `hair` | capelli (ricolorabili dall'app) | sopra la faccia |
| `glasses` | occhiali, maschere sugli occhi | sopra i capelli |
| `hat` | cappelli, caschi, cose in testa | sopra a quasi tutto; nasconde i capelli sopra il proprio bordo |
| `costume` | testa e corpo insieme (suora, felpa col cappuccio alzato) | prende il posto di vestito **e** cappello; nasconde tutti i capelli |
| `extra` | oggetti davanti al personaggio (manubri, cartelli) | sopra a tutto |

Per **sostituire** un asset basta sovrascrivere il file con lo stesso nome: verrà rielaborato da solo.

### 3. Lancia l'elaborazione
Apri un terminale in questa cartella (`avatar-pipeline`) e lancia:

```bash
npm run build
```

Elabora solo i file nuovi o cambiati (circa 4 secondi l'uno). Alla fine stampa:
- **Saltati**: gli asset esclusi di proposito in `config.json`, con il motivo;
- **Da controllare**: problemi trovati in automatico, come una categoria sconosciuta, un oggetto che tocca il bordo, un pezzo di personaggio sparito o la faccia cambiata.

Per rifare tutto da zero: `npm run rebuild`.

### 4. Controlla il risultato
```bash
npm run preview -- hair_afro hat_top_hat
```
Crea `output/preview/selection.jpg`, con ogni asset indicato sopra la base. Altre anteprime:

- `npm run preview`: tutti gli asset → `output/preview/layers.jpg`
- `npm run preview -- --random 12`: 12 personaggi a caso → `output/preview/random.jpg`, utile per scoprire combinazioni che stonano

### 5. Pubblicalo nell'app
```bash
npm run export
```
Copia gli asset nell'app web in versione leggera (512 px, WebP), insieme ai 10 colori di ogni taglio di capelli, e aggiorna il catalogo `bestia-web/src/lib/avatar/catalog.json`. Il nuovo pezzo compare subito nell'editor del personaggio. Gli asset saltati o cancellati spariscono anche dall'app.

Per dare al pezzo un nome leggibile nell'editor, aggiungilo in `config.json` sotto `labels`, per esempio `"hair_afro": "Afro"`. Senza etichetta usa il nome del file. Anche i colori dei capelli si cambiano in `config.json`, sotto `hairColors`.

---

## Se un asset non viene bene

Prima di tutto chiediti se conviene **rigenerarlo**: è quasi sempre la strada più veloce. Altrimenti si regola in `config.json`.

**Escluderlo per ora** (resta fuori dall'app finché non lo togli da qui):
```json
"skip": {
  "hat_qualcosa": "motivo, così ci ricordiamo cosa rifare"
}
```

**Regolarlo**, nella sezione `items`:
```json
"items": {
  "hat_qualcosa": { "thr": 20 }
}
```

| Opzione | Quando usarla |
|---|---|
| `"thr": 20` | mancano pezzi dell'oggetto perché ha un colore simile a pelle o maglietta (default 40; più basso prende di più) |
| `"grow": 6` | i bordi dell'oggetto sono sfumati o radi (barba corta, peli) |
| `"holeMax": 40000` | l'oggetto ha buchi interni che vanno riempiti (lenti degli occhiali) |
| `"minPx": 300` | l'oggetto è piccolissimo e sparisce (sigaretta) |
| `"translucent": true` | l'oggetto è trasparente o semitrasparente (medusa, vetro) |
| `"hidesHair": "all"` | il cappello copre la testa intera (zucca, cappuccio). I costumi lo fanno già da soli |
| `"hidesFace": true` | il cappello copre anche la faccia (vongola chiusa) |

Poi rilancia `npm run build`: rielabora da solo gli asset toccati.

**Casi noti difficili**
- *Oggetto bianco o grigio sopra la maglietta* (barba di Babbo Natale): nelle zone in ombra ha lo stesso colore della maglietta e lo script non lo vede. Serve un secondo passaggio in Nano Banana: partendo dall'immagine già generata, `remove the character completely, keep only the [OGGETTO] exactly where it is, same size and position, pure magenta background`. Il supporto a questo passaggio nello script è ancora da fare.
- *Scritte e loghi*: escono spesso deformate, e i marchi o i nomi reali vanno evitati se l'app diventa pubblica.

---

## Cosa c'è in `output/`
- `layers/base.png`: il personaggio base trasparente
- `layers/base_nobrows.png` e `layers/eyebrows.png`: la base senza sopracciglia, con la pelle ricostruita sotto, e le sopracciglia da sole. L'app le disegna nel colore dei capelli. Se un giorno cambia la base e le sopracciglia sono in un altro punto, aggiorna in `config.json` la voce `"eyebrows": { "box": [x0, y0, x1, y1] }`, cioè il riquadro sulla base a 2048 px che le contiene senza toccare le palpebre (oggi `[780, 690, 1270, 782]`)
- `layers/<categoria>/<id>.png`: un livello per asset, 2048×2048, già in posizione
- `layers/hairmask/<id>.png`: per ogni cappello o costume, la maschera che indica dove i capelli restano visibili (bianco = visibili)
- `manifest.json`: elenco degli asset, con l'ordine di disegno, gli slot occupati dai costumi e le opzioni `hidesHair` e `hidesFace`
- `preview/`: le anteprime

## Regola d'oro
**La base non si tocca.** Tutti gli asset sono modifiche di `body.jpg`: se la base cambia, anche di poco, vanno rigenerati tutti.
