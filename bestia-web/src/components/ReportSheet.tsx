"use client";

/* eslint-disable @next/next/no-img-element -- anteprima di un'immagine generata nel browser (blob:) */
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Image as ImageIcon, MessageCircle, Share2, Type } from "lucide-react";
import type { GameState, HistoryEntry } from "@/engine";
import { buildReport, summarize } from "@/lib/report";
import { drawReportCard } from "@/lib/reportCard";
import { useCharacterLookup } from "@/lib/avatar/overrides";
import { Button, Sheet } from "./Sheet";

/**
 * Resoconto da mandare nel gruppo: come testo (WhatsApp, copia, altre app) o come immagine
 * con i personaggi (condividi, copia, scarica).
 */
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
  const [mode, setMode] = useState<"text" | "image">("text");
  const origin = typeof window === "undefined" ? undefined : window.location.origin;
  const text = useMemo(() => buildReport({ state, history, times, title, url: origin }), [state, history, times, title, origin]);

  return (
    <Sheet open onClose={onClose} title={state.status === "ended" ? "Resoconto della partita" : "Resoconto parziale"}>
      <div role="tablist" aria-label="Formato" className="grid grid-cols-2 gap-1 rounded-2xl bg-night-900 p-1">
        {(
          [
            ["text", "Testo", <Type key="t" size={16} />],
            ["image", "Immagine", <ImageIcon key="i" size={16} />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold transition ${
              mode === id ? "bg-night-700 text-white" : "text-white/55 hover:text-white/80"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>
      {mode === "text" ? <TextReport text={text} /> : <ImageReport state={state} history={history} times={times} title={title} />}
    </Sheet>
  );
}

function TextReport({ text }: { text: string }) {
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
    <>
      <p className="mt-3 text-sm text-white/70">Da mandare nel gruppo: grassetti ed emoji compaiono come su WhatsApp.</p>
      <pre
        aria-label="Testo del resoconto"
        className="mt-3 max-h-[42dvh] select-all overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-night-900 p-3 font-sans text-sm leading-relaxed text-white/85"
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
    </>
  );
}

function ImageReport({ state, history, times, title }: { state: GameState; history: HistoryEntry[]; times?: string[]; title?: string }) {
  const lookup = useCharacterLookup();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    const data = summarize({ state, history, times, title });
    drawReportCard(data, (name) => lookup(name), window.location.host)
      .then((blob) => {
        if (!alive) return;
        const day = new Date().toISOString().slice(0, 10);
        setFile(new File([blob], `bestia-${day}.png`, { type: "image/png" }));
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [state, history, times, title, lookup]);

  const canShareFile = !!file && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  const canCopy = typeof window !== "undefined" && "ClipboardItem" in window && !!navigator.clipboard?.write;

  async function copy() {
    if (!file) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* il browser non permette di copiare immagini: resta "Scarica" */
    }
  }

  return (
    <>
      <p className="mt-3 text-sm text-white/70">Un&apos;immagine con i personaggi, da mandare nel gruppo come foto.</p>
      <div className="mt-3 grid max-h-[46dvh] place-items-center overflow-auto rounded-2xl bg-night-900 p-2">
        {url ? (
          <img src={url} alt="Immagine del resoconto" className="w-full max-w-sm rounded-xl" />
        ) : (
          <p className="py-16 text-sm text-white/50">{error ? "Non sono riuscito a creare l'immagine." : "Preparo l'immagine…"}</p>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {canShareFile && (
          <Button
            variant="success"
            className="flex items-center justify-center gap-2"
            onClick={() => navigator.share({ files: [file!] }).catch(() => {})}
          >
            <Share2 size={19} /> Condividi immagine
          </Button>
        )}
        <div className="flex gap-2">
          {canCopy && (
            <Button variant="secondary" disabled={!file} className="flex flex-1 items-center justify-center gap-2 py-2.5 text-sm" onClick={copy}>
              {copied ? <Check size={17} /> : <Copy size={17} />} {copied ? "Copiata" : "Copia immagine"}
            </Button>
          )}
          <a
            href={url ?? undefined}
            download={file?.name}
            aria-disabled={!url}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl bg-night-600 py-2.5 text-sm font-bold text-white hover:bg-night-700 ${url ? "" : "pointer-events-none opacity-40"}`}
          >
            <Download size={17} /> Scarica
          </a>
        </div>
      </div>
    </>
  );
}
