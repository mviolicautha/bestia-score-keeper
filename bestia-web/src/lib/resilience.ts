/**
 * Pezzi per reggere una serata vera: rete ballerina, telefoni in standby, due dispositivi del master.
 */

/** La partita è cambiata dopo che l'abbiamo letta (altro dispositivo, o salvataggio già riuscito). */
export class SaveConflictError extends Error {
  constructor() {
    super("La partita è cambiata nel frattempo.");
    this.name = "SaveConflictError";
  }
}

/**
 * Chiama `cb` quando la pagina torna utile dopo una pausa: lo schermo si riaccende, si torna
 * sulla scheda, torna la rete. Sui telefoni in standby il collegamento in tempo reale cade e
 * alcuni aggiornamenti si perdono: al risveglio si ricarica.
 */
export function onWake(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const visible = () => {
    if (document.visibilityState === "visible") cb();
  };
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("online", cb);
  window.addEventListener("pageshow", cb);
  return () => {
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("online", cb);
    window.removeEventListener("pageshow", cb);
  };
}

/** Il database non ha ancora la versione nuova della funzione (script SQL non eseguito). */
export function isMissingFunction(error: { message: string; code?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function|function .* does not exist/i.test(error.message);
}
