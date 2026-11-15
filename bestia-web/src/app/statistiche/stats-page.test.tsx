// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { replay, type GameEvent } from "@/engine";
import type { CareerGame } from "@/lib/stats";
import { Results } from "@/components/Results";
import StatsPage from "./page";

vi.mock("next/navigation", async () => (await import("@/test/setup-next")).navigationMock);
vi.mock("next/link", async () => ({ default: (await import("@/test/setup-next")).LinkMock }));
vi.mock("@/lib/useAccount", () => ({ useAccount: () => ({ account: { username: "anna", userId: "u-anna" } }) }));

const games: CareerGame[] = [];
vi.mock("@/lib/statsData", () => ({ getStats: () => ({ myGames: async () => games }) }));

const players: GameEvent[] = ["Anna", "Bruno", "Carla", "Dario", "Elena"].map((name, i) => ({ type: "player_added", playerId: `p${i}`, name }));
const win = (id: string, losers: string[][] = []): GameEvent => ({ type: "hand_played", winners: [{ playerIds: [id], tricks: 3 }], losers });
const night = (events: GameEvent[]) => replay([{ type: "game_started", baseBetCents: 30 }, ...players, ...events, { type: "game_ended" }]);
const norm = (t: string | null | undefined) => (t ?? "").replace(/[  ]/g, " ");

afterEach(cleanup);

describe("statistiche e soprannomi", () => {
  it("la pagina mostra soprannome, numeri e rivalità", async () => {
    const keyOf = { p1: "p:bruno", p2: "p:carla", p3: "p:dario", p4: "n:elena" };
    games.splice(0, games.length,
      { gameId: "g1", title: "Venerdì", endedAt: "2026-11-06T23:00:00Z", me: "p0", keyOf, ...night([win("p0", [["p3"]]), win("p0", [["p3"]]), win("p0")]) },
      { gameId: "g2", title: "Sabato", endedAt: "2026-11-07T23:00:00Z", me: "p0", keyOf, ...night([win("p0", [["p3"]]), win("p0")]) },
    );
    render(<StatsPage />);
    expect(await screen.findByText("Il tuo soprannome")).toBeInTheDocument();
    expect(screen.getAllByText("Il Re della serata")).toHaveLength(2); // scheda e collezione
    expect(screen.getByText("Il tuo bancomat")).toBeInTheDocument();
    expect(screen.getByText("contro Dario")).toBeInTheDocument();
    expect(screen.getByText("2 serate in attivo di fila 🔥")).toBeInTheDocument();
    expect(norm(document.body.textContent)).toMatch(/Soprannomi raccolti.*Il Re della serata×2/);
  });

  it("a fine partita ognuno vede il suo soprannome in classifica", () => {
    const { state, history } = night([win("p0", [["p3"]]), win("p0", [["p3"]]), win("p0")]);
    render(<Results state={state} history={history} />);
    expect(screen.getByText(/👑 Il Re della serata/)).toBeInTheDocument();
    expect(screen.getByText(/🏧 Il Bancomat/)).toBeInTheDocument();
  });
});
