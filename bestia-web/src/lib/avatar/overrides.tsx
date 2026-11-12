"use client";

import { createContext, useContext } from "react";
import type { CharacterConfig } from "./catalog";
import { characterKey, useCharacter } from "./store";

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
