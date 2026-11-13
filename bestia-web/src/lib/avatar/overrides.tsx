"use client";

import { createContext, useCallback, useContext } from "react";
import type { CharacterConfig } from "./catalog";
import { characterKey, getCharacter, useCharacter } from "./store";

/**
 * Personaggi che arrivano da fuori (i telefoni dei giocatori, via Supabase), per nome.
 * Una pagina li fornisce con <CharacterOverrides>; Avatar e tavolo li usano al posto
 * di quelli salvati su questo dispositivo.
 */
const Overrides = createContext<Record<string, CharacterConfig>>({});

export function CharacterOverrides({ value, children }: { value: Record<string, CharacterConfig>; children: React.ReactNode }) {
  return <Overrides.Provider value={value}>{children}</Overrides.Provider>;
}

export function useCharacterFor(name: string): CharacterConfig | null {
  const remote = useContext(Overrides)[characterKey(name)];
  const local = useCharacter(name);
  return remote ?? local;
}

/** Per disegnare fuori da React (es. l'immagine del resoconto): personaggio per nome, con la stessa priorità. */
export function useCharacterLookup(): (name: string) => CharacterConfig | null {
  const remote = useContext(Overrides);
  return useCallback((name: string) => remote[characterKey(name)] ?? getCharacter(name), [remote]);
}
