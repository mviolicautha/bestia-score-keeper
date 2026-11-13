"use client";

import { useMemo, useState } from "react";
import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
import type { GameState, HistoryEntry } from "@/engine";
import { buildReport } from "@/lib/report";
import { Button, Sheet } from "./Sheet";

/** Anteprima del resoconto, con i pulsanti per mandarlo su WhatsApp, copiarlo o condividerlo. */
export function ReportSheet({
  state,
  history,
  times,
  title,
  onClose,
}: {
  state: GameState;
  history: HistoryEntry[];
  times?: string[];
  title?: string;
  onClose: () => void;
}) {
  const text = useMemo(
    () => buildReport({ state, history, times, title, url: typeof window === "undefined" ? undefined : window.location.origin }),
    [state, history, times, title],
  );
  const [copied, setCopied] = useState<boolean | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // appunti non disponibili (pagina non sicura, permesso negato): si seleziona a mano dall'anteprima
      setCopied(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={state.status === "ended" ? "Resoconto della partita" : "Resoconto parziale"}>
      <p className="text-sm text-white/70">Da mandare nel gruppo: grassetti ed emoji compaiono come su WhatsApp.</p>
      <pre
        aria-label="Testo del resoconto"
        className="mt-3 max-h-[45dvh] select-all overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-night-900 p-3 font-sans text-sm leading-relaxed text-white/85"
      >
        {text}
      </pre>
      {copied === false && <p className="mt-2 text-xs text-amber-300">Non riesco a copiare: tieni premuto sul testo per selezionarlo.</p>}
      <div className="mt-3 flex flex-col gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl bg-[#1f9d55] py-3 font-bold text-white hover:bg-[#23b25f]"
        >
          <MessageCircle size={19} /> Manda su WhatsApp
        </a>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex flex-1 items-center justify-center gap-2 py-2.5 text-sm" onClick={copy}>
            {copied ? <Check size={17} /> : <Copy size={17} />} {copied ? "Copiato" : "Copia testo"}
          </Button>
          {canShare && (
            <Button
              variant="secondary"
              className="flex flex-1 items-center justify-center gap-2 py-2.5 text-sm"
              onClick={() => navigator.share({ text }).catch(() => {})}
            >
              <Share2 size={17} /> Altre app
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
