"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { normalizeCode } from "@/lib/online";
import { GAME_CODE_LENGTH } from "@/lib/tvLink";

/**
 * `/tv`: dal browser della TV si scrive solo il codice della partita (quello sul telefono del
 * master). Al quinto carattere si parte da soli, così col telecomando basta il codice.
 */
export default function TvCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const clean = normalizeCode(code).slice(0, GAME_CODE_LENGTH);

  function go(value: string) {
    if (sent || value.length !== GAME_CODE_LENGTH) return;
    setSent(true);
    router.push(`/t/${value}`);
  }

  return (
    <main className="grid h-dvh place-items-center bg-night-950 p-[4vh] text-center text-[clamp(18px,2.2vw,48px)]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(clean);
        }}
        className="w-full max-w-[24em]"
      >
        <p className="text-[0.75em] font-semibold uppercase tracking-[0.3em] text-gold-400">♠ Bestia · vista TV</p>
        <label htmlFor="tv-code" className="mt-[0.4em] block text-[1.5em] font-black leading-tight">
          Scrivi il codice della partita
        </label>
        <p className="mt-[0.3em] text-white/55">Lo trovi sul telefono del master, in «Vista TV».</p>
        <input
          id="tv-code"
          value={clean}
          onChange={(e) => {
            const next = normalizeCode(e.target.value).slice(0, GAME_CODE_LENGTH);
            setCode(next);
            go(next);
          }}
          autoFocus
          placeholder="KX7P2"
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className="mt-[0.8em] w-full rounded-[0.6em] bg-night-800 px-[0.5em] py-[0.25em] text-center font-mono text-[2.6em] font-black uppercase tracking-[0.35em] text-white outline-none ring-2 ring-white/10 placeholder:text-white/15 focus:ring-4 focus:ring-gold-400"
        />
        <button
          type="submit"
          disabled={clean.length !== GAME_CODE_LENGTH || sent}
          className="mt-[0.8em] w-full rounded-[0.6em] bg-gold-400 py-[0.5em] font-bold text-night-950 outline-none focus-visible:ring-4 focus-visible:ring-white disabled:opacity-40"
        >
          {sent ? "Apro la partita…" : "Apri la vista TV"}
        </button>
      </form>
    </main>
  );
}
