"use client";

import { useSyncExternalStore } from "react";
import { usePref } from "./prefs";

/** La settimana di Natale: dal 21 al 27 dicembre compresi. */
export function isChristmasSeason(d: Date = new Date()): boolean {
  return d.getMonth() === 11 && d.getDate() >= 21 && d.getDate() <= 27;
}

/** "on" non compare nell'interfaccia: serve per provare il tema fuori stagione (da localStorage). */
export const FESTIVE_MODES = ["auto", "off", "on"] as const;
export type FestiveMode = (typeof FESTIVE_MODES)[number];

const noSubscribe = () => () => {};

/**
 * Tema natalizio: acceso da solo nella settimana di Natale, a meno che su questo
 * dispositivo non sia stato spento. Sul server vale "spento", per non sfasare l'idratazione.
 */
export function useFestive(): { inSeason: boolean; active: boolean; mode: FestiveMode; setMode: (m: FestiveMode) => void } {
  const inSeason = useSyncExternalStore(noSubscribe, () => isChristmasSeason(), () => false);
  const [mode, setMode] = usePref<FestiveMode>("festive", "auto", FESTIVE_MODES);
  return { inSeason, active: mode === "on" || (inSeason && mode === "auto"), mode, setMode };
}
