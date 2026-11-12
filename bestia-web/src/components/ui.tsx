"use client";

import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useCharacterFor } from "@/lib/avatar/overrides";
import { Character, CROPS } from "./Character";
import { Button, Sheet } from "./Sheet";

/**
 * Colori dei giocatori, assegnati per posto al tavolo (stessa logica dell'app Flutter):
 * un giocatore tiene il suo colore per tutta la serata, anche se altri escono.
 */
export const SEAT_COLORS = [
  "bg-red-700",
  "bg-blue-700",
  "bg-green-700",
  "bg-orange-700",
  "bg-purple-700",
  "bg-teal-700",
  "bg-pink-700",
  "bg-slate-600",
  "bg-amber-800",
  "bg-indigo-700",
  "bg-lime-800",
  "bg-cyan-800",
];

/**
 * Icona tonda del giocatore: il suo personaggio se l'ha creato, altrimenti l'iniziale.
 * Lo sfondo resta il colore del posto, così si riconosce anche a colpo d'occhio.
 */
export function Avatar({
  name,
  seat,
  dealer = false,
  size = "md",
}: {
  name: string;
  seat: number;
  dealer?: boolean;
  /** `lg` si misura in em: per la vista TV, che scala col testo. */
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const character = useCharacterFor(name);
  const dim = {
    sm: "h-8 w-8 text-sm",
    md: "h-11 w-11 text-lg",
    lg: "h-[2.4em] w-[2.4em] text-[1.1em]",
    xl: "h-20 w-20 text-3xl",
  }[size];
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={`grid place-items-center overflow-hidden rounded-full font-black text-white ring-2 ring-white/15 ${dim} ${SEAT_COLORS[seat % SEAT_COLORS.length]}`}
        aria-hidden
      >
        {character ? (
          <Character config={character} crop={CROPS.head} className="h-full w-full" />
        ) : (
          name.trim().charAt(0).toUpperCase() || "?"
        )}
      </span>
      {dealer && (
        <span
          className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-amber-600 text-[10px] font-black text-black ring-2 ring-night-800"
          title="Mazziere"
        >
          D
        </span>
      )}
    </span>
  );
}

export interface ConfirmRequest {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

/** Conferma dentro l'app (al posto del confirm() del browser). */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <Sheet open={request !== null} onClose={onClose} title={request?.title ?? ""}>
      {request && (
        <>
          <div className="text-sm leading-relaxed text-white/75">{request.message}</div>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              Annulla
            </Button>
            <Button
              variant={request.danger ? "danger" : "primary"}
              className="flex-1"
              onClick={() => {
                request.onConfirm();
                onClose();
              }}
            >
              {request.confirmLabel}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

export type ToastMessage = { text: string; kind: "error" | "info" | "success"; id: number };

export function Toast({ toast, onDone }: { toast: ToastMessage | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, toast.kind === "error" ? 4000 : 2200);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  if (!toast) return null;
  const style = {
    error: "bg-amber-400 text-black",
    info: "bg-night-600 text-white",
    success: "bg-felt-600 text-white",
  }[toast.kind];
  const Icon = { error: AlertTriangle, info: Info, success: CheckCircle2 }[toast.kind];
  return (
    <div
      key={toast.id}
      role="status"
      className={`fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[60] mx-auto flex max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl ${style}`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <span>{toast.text}</span>
    </div>
  );
}

/** Piccola vibrazione al tocco, dove il dispositivo la supporta (Android). */
export function haptic(ms = 10) {
  try {
    // Senza un tocco reale il browser blocca la vibrazione (e scrive un errore in console).
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    navigator.vibrate?.(ms);
  } catch {
    /* non supportato */
  }
}
