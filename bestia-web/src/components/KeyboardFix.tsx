"use client";

import { useEffect } from "react";

const FIELDS = "input, textarea, select, [contenteditable='true']";

/**
 * iPhone, web app in Home: quando la tastiera si chiude, Safari lascia la pagina spostata
 * di qualche pixel rispetto allo schermo. Gli elementi fissi (la fascia sotto l'isola, la
 * barra della partita) restano fuori posto e il contenuto torna a scorrere sotto l'orologio.
 * Riportare lo scroll dove già si trova costringe Safari a riallineare la vista.
 */
export function KeyboardFix() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const realign = () => {
      clearTimeout(timer);
      // aspetta che la tastiera finisca di chiudersi; se il focus è passato a un altro campo non fare nulla
      timer = setTimeout(() => {
        if (document.activeElement?.matches(FIELDS)) return;
        window.scrollTo(window.scrollX, window.scrollY);
      }, 100);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (e.target instanceof Element && e.target.matches(FIELDS)) realign();
    };
    const vv = window.visualViewport;
    document.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", realign);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", realign);
    };
  }, []);
  return null;
}
