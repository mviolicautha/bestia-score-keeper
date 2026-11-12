"use client";

/* eslint-disable @next/next/no-img-element -- il QR è un'immagine generata al volo (data URL) */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Share2 } from "lucide-react";
import { Button, Sheet } from "./Sheet";

/** Link d'invito di una partita: lo apre chi inquadra il QR. */
export const inviteUrl = (code: string) => `${window.location.origin}/g/${code}`;

/** Il master mostra il QR (o detta il codice): i giocatori si uniscono dal proprio telefono. */
export function InviteSheet({ code, title, onClose }: { code: string; title: string; onClose: () => void }) {
  const url = inviteUrl(code);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 560, color: { dark: "#0d1220", light: "#ffffff" } })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* appunti non disponibili (pagina non sicura): il link resta visibile da copiare a mano */
    }
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Sheet open onClose={onClose} title="Invita giocatori">
      <p className="text-sm text-white/70">
        Inquadrate il QR con la fotocamera del telefono: ognuno tocca il suo nome (&quot;Sono io&quot;) e vede la partita in diretta.
        Chi non è ancora al tavolo può chiedere di sedersi.
      </p>
      <div className="mx-auto mt-4 w-56 overflow-hidden rounded-2xl bg-white p-2 sm:w-64">
        {qr ? (
          <img src={qr} alt={`QR code per unirsi a ${title}`} className="block aspect-square w-full" />
        ) : (
          <div className="grid aspect-square w-full place-items-center text-sm text-night-900/50">Preparo il QR…</div>
        )}
      </div>
      <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Codice</p>
      <p className="tabular text-center font-mono text-4xl font-black tracking-[0.35em] text-gold-400" aria-label={`Codice ${code.split("").join(" ")}`}>
        {code}
      </p>
      <p className="mt-3 break-all rounded-xl bg-night-900 p-3 text-center font-mono text-xs text-white/60">{url}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="flex flex-1 items-center justify-center gap-2 py-2.5 text-sm" onClick={copy}>
          {copied ? <Check size={17} /> : <Copy size={17} />} {copied ? "Copiato" : "Copia link"}
        </Button>
        {canShare && (
          <Button
            className="flex flex-1 items-center justify-center gap-2 py-2.5 text-sm"
            onClick={() => navigator.share({ title: `Bestia: ${title}`, text: `Unisciti alla partita (codice ${code})`, url }).catch(() => {})}
          >
            <Share2 size={17} /> Condividi
          </Button>
        )}
      </div>
    </Sheet>
  );
}
