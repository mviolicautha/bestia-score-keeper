import { normalizeCode } from "@/lib/online";

/** I codici delle partite hanno 5 caratteri (create_game / import_game, senza 0/O e 1/I). */
export const GAME_CODE_LENGTH = 5;
/** Lo stesso alfabeto di create_game (0001_partite.sql): niente 0/O e 1/I. */
export const GAME_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** true se il testo, a parte maiuscole/minuscole, potrebbe essere il codice di una partita. */
export const couldBeGameCode = (text: string) =>
  text.length === GAME_CODE_LENGTH && [...text.toUpperCase()].every((c) => GAME_CODE_ALPHABET.includes(c));

/**
 * Percorso corto della vista TV: `/KX7P2`, da scrivere col telecomando.
 * next.config.ts lo riscrive su `/t/KX7P2`, che trova la partita e apre `/tv/[id]`.
 */
export const shortTvPath = (code: string) => `/${normalizeCode(code)}`;

/** Indirizzo da mostrare (e dettare): senza https:// e senza www., che il browser della TV aggiunge da solo. */
export const displayHost = (origin: string) => origin.replace(/^https?:\/\//, "").replace(/^www\./, "");
