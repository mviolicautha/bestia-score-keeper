import { vi } from "vitest";
import type { JoinRequest, OnlineGame, OnlineService, SeatClaim } from "@/lib/online";

/**
 * Finto servizio online per i test dell'interfaccia: stato in memoria, notifiche immediate.
 * Si installa con setOnlineForTests(fake.service).
 */
export function fakeOnline(game: OnlineGame, myId = "u-io") {
  const state = { seats: [] as SeatClaim[], requests: [] as (JoinRequest & { gameId: string })[] };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());

  const service = {
    myId: vi.fn(async () => myId),
    findGameByCode: vi.fn(async (code: string) => (code.toUpperCase() === game.code ? game : null)),
    getGame: vi.fn(async (id: string) => (id === game.id ? game : null)),
    listSeats: vi.fn(async () => [...state.seats]),
    claimSeat: vi.fn(async (_gameId: string, playerId: string) => {
      if (state.seats.some((s) => s.playerId === playerId)) throw Object.assign(new Error("dup"), { code: "23505" });
      state.seats.push({ playerId, profileId: myId, character: null });
      notify();
    }),
    releaseSeat: vi.fn(async (_g: string, playerId: string) => {
      state.seats = state.seats.filter((s) => s.playerId !== playerId);
      notify();
    }),
    saveProfile: vi.fn(async () => {}),
    requestToJoin: vi.fn(async (gameId: string, name: string) => {
      const r = { id: `r${state.requests.length + 1}`, gameId, profileId: myId, name: name.trim(), status: "pending" as const, playerId: null, createdAt: "t" };
      state.requests.push(r);
      notify();
      return r;
    }),
    myRequest: vi.fn(async () => state.requests.filter((r) => r.profileId === myId).at(-1) ?? null),
    pendingRequests: vi.fn(async () => (game.masterId === myId ? state.requests.filter((r) => r.status === "pending") : [])),
    decideRequest: vi.fn(async (id: string, status: "approved" | "rejected", playerId?: string) => {
      const r = state.requests.find((x) => x.id === id);
      if (r) Object.assign(r, { status, playerId: playerId ?? null });
      notify();
    }),
    subscribe: vi.fn((_g: string, fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
  };
  return { service: service as unknown as OnlineService, state, notify, calls: service };
}
