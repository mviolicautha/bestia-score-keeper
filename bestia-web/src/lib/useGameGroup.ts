"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isEmpty, normalize, type CharacterConfig } from "./avatar/catalog";
import { characterKey } from "./avatar/store";
import { getGroups, type GroupDetail, type GroupMember } from "./groups";

export interface GameGroup {
  group: GroupDetail;
  /** player_id → member_id: i giocatori della partita legati ai membri. */
  links: Record<string, string>;
  /** Il membro legato a un giocatore, se c'è. */
  memberOf: (playerId: string) => GroupMember | undefined;
  /** Personaggi dei membri, per nome (chiave di characterKey). */
  characters: Record<string, CharacterConfig>;
  reload: () => Promise<void>;
}

/**
 * La compagnia di una partita (se ne ha una): membri, chi è legato a quale giocatore e i loro
 * personaggi. Si aggiorna quando cambiano i membri. null per le partite al volo o senza backend.
 */
export function useGameGroup(groupId: string | null | undefined, gameId: string): GameGroup | null {
  const groups = getGroups();
  const [data, setData] = useState<{ group: GroupDetail; links: Record<string, string> } | null>(null);

  const reload = useCallback(async () => {
    if (!groups || !groupId) return;
    try {
      const [group, links] = await Promise.all([groups.get(groupId), groups.gamePlayers(gameId)]);
      setData(group ? { group, links } : null);
    } catch {
      /* rete assente: resta l'ultimo stato */
    }
  }, [groups, groupId, gameId]);

  useEffect(() => {
    if (!groups || !groupId) return;
    void Promise.resolve().then(reload);
    return groups.subscribe(groupId, () => void reload());
  }, [groups, groupId, reload]);

  return useMemo(() => {
    if (!data || !groupId) return null;
    const byId = new Map(data.group.members.map((m) => [m.id, m]));
    const characters: Record<string, CharacterConfig> = {};
    for (const m of data.group.members) {
      const c = normalize(m.character);
      if (!isEmpty(c)) characters[characterKey(m.name)] = c;
    }
    return {
      ...data,
      memberOf: (playerId: string) => {
        const memberId = data.links[playerId];
        return memberId ? byId.get(memberId) : undefined;
      },
      characters,
      reload,
    };
  }, [data, groupId, reload]);
}
