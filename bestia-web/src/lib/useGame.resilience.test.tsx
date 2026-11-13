// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@/engine";
import { getRepository, SaveConflictError } from "./repository";
import { CONFLICT, OFFLINE, useGame } from "./useGame";

/**
 * Situazioni di una serata vera: rete che cade, risposte perse, secondo dispositivo del master.
 * Si usa il salvataggio locale, con guasti simulati.
 */

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const repo = () => getRepository();
const types = async (id: string) => (await repo().loadEvents(id)).map((e) => e.event.type);

async function setup() {
  const id = await repo().createGame("Serata", 30);
  for (const [i, name] of ["Anna", "Bruno", "Carla", "Dario", "Elena"].entries()) {
    await repo().appendEvent(id, { type: "player_added", playerId: `p${i}`, name }, "in_progress");
  }
  const hook = renderHook(() => useGame(id));
  await vi.waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { id, hook };
}

const pass: GameEvent = { type: "hand_passed" };

describe("salvataggi con la rete ballerina", () => {
  it("senza rete non salva niente e lo dice", async () => {
    const { id, hook } = await setup();
    vi.spyOn(repo(), "loadEvents").mockRejectedValueOnce(new Error("Failed to fetch"));
    let res: unknown;
    await act(async () => {
      res = await hook.result.current.dispatch(pass);
    });
    expect(res).toBe(OFFLINE);
    expect(await types(id)).not.toContain("hand_passed");
  });

  it("se la risposta si perde ma la mano è stata salvata, non dà errore e non la registra due volte", async () => {
    const { id, hook } = await setup();
    const real = repo().appendEvent.bind(repo());
    vi.spyOn(repo(), "appendEvent").mockImplementationOnce(async (...args) => {
      await real(...args); // il server salva…
      throw new Error("timeout"); // …ma la risposta non arriva
    });
    let res: unknown;
    await act(async () => {
      res = await hook.result.current.dispatch(pass);
    });
    expect(res).toBeNull();
    expect((await types(id)).filter((t) => t === "hand_passed")).toHaveLength(1);
  });

  it("se il salvataggio non arriva al server, chiede di riprovare", async () => {
    const { id, hook } = await setup();
    vi.spyOn(repo(), "appendEvent").mockRejectedValueOnce(new Error("Failed to fetch"));
    let res: unknown;
    await act(async () => {
      res = await hook.result.current.dispatch(pass);
    });
    expect(res).toBe(OFFLINE);
    expect(await types(id)).not.toContain("hand_passed");
    // al secondo tentativo, con la rete tornata, salva una volta sola
    await act(async () => {
      res = await hook.result.current.dispatch(pass);
    });
    expect(res).toBeNull();
    expect((await types(id)).filter((t) => t === "hand_passed")).toHaveLength(1);
  });

  it("due dispositivi del master: se l'altro ha appena salvato, questo non sovrascrive e avvisa", async () => {
    const { id, hook } = await setup();
    const real = repo().appendEvent.bind(repo());
    vi.spyOn(repo(), "appendEvent").mockImplementationOnce(async (gameId, event, status, expected) => {
      await real(gameId, { type: "bet_changed", baseBetCents: 60 }, "in_progress"); // l'altro dispositivo arriva prima
      await real(gameId, event, status, expected); // il numero atteso non torna più
    });
    let res: unknown;
    await act(async () => {
      res = await hook.result.current.dispatch(pass);
    });
    expect(res).toBe(CONFLICT);
    const evs = await types(id);
    expect(evs.at(-1)).toBe("bet_changed");
    expect(evs).not.toContain("hand_passed");
    // la schermata si è già aggiornata con il salvataggio dell'altro dispositivo
    expect(hook.result.current.state?.baseBetCents).toBe(60);
  });

  it("'Annulla' senza rete lo dice; con la risposta persa ma riuscito, conta come fatto", async () => {
    const { id, hook } = await setup();
    vi.spyOn(repo(), "loadEvents").mockRejectedValueOnce(new Error("Failed to fetch"));
    let res: unknown;
    await act(async () => {
      res = await hook.result.current.undo();
    });
    expect(res).toBe(OFFLINE);
    expect(await types(id)).toHaveLength(6);

    const real = repo().removeLastEvent.bind(repo());
    vi.spyOn(repo(), "removeLastEvent").mockImplementationOnce(async (...args) => {
      await real(...args);
      throw new Error("timeout");
    });
    await act(async () => {
      res = await hook.result.current.undo();
    });
    expect(res).toBe(true);
    expect(await types(id)).toHaveLength(5); // annullato una volta sola
  });

  it("se la prima apertura avviene senza rete, riprova da sola", async () => {
    const id = await repo().createGame("Serata", 30);
    const real = repo().loadEvents.bind(repo());
    vi.spyOn(repo(), "loadEvents").mockRejectedValueOnce(new Error("Failed to fetch")).mockImplementation(real);
    const hook = renderHook(() => useGame(id));
    expect(hook.result.current.loading).toBe(true);
    await vi.waitFor(() => expect(hook.result.current.loading).toBe(false), { timeout: 4000 });
    expect(hook.result.current.state?.status).toBe("in_progress");
  });

  it("il salvataggio locale rifiuta se il numero di eventi atteso non torna", async () => {
    const id = await repo().createGame("Serata", 30);
    await expect(repo().appendEvent(id, pass, "in_progress", 5)).rejects.toBeInstanceOf(SaveConflictError);
    await expect(repo().removeLastEvent(id, "in_progress", 9)).rejects.toBeInstanceOf(SaveConflictError);
  });
});
