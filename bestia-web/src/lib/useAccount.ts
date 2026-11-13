"use client";

import { useCallback, useEffect, useState } from "react";
import { getAccounts, type Account } from "./account";

/**
 * L'account di questo telefono. `account` è undefined mentre carica, null se non disponibile
 * (app solo locale o nessuna connessione).
 */
export function useAccount() {
  const accounts = getAccounts();
  const [account, setAccount] = useState<Account | null | undefined>(accounts ? undefined : null);

  const reload = useCallback(async () => {
    if (!accounts) return;
    try {
      setAccount(await accounts.current());
    } catch {
      setAccount(null);
    }
  }, [accounts]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  return { account, reload, accounts };
}

/**
 * Dopo essere entrati, usciti o aver eliminato l'account si ricarica la pagina: così ogni parte
 * dell'app (partite, tempo reale, posti presi) riparte con l'utente giusto.
 */
export function restartApp(path = "/") {
  window.location.assign(path);
}
