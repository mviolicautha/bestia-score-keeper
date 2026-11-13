// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRepository } from "@/lib/repository";
import { route } from "@/test/setup-next";
import TvPage from "./page";

vi.mock("next/navigation", async () => (await import("@/test/setup-next")).navigationMock);

const norm = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ");

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

async function seed() {
  const repo = getRepository();
  const id = await repo.createGame("TV", 30);
  for (const [i, name] of ["Anna", "Bruno", "Carla", "Dario", "Elena"].entries()) {
    await repo.appendEvent(id, { type: "player_added", playerId: `p${i}`, name }, "in_progress");
  }
  route.id = id;
  return { id, repo };
}

describe("vista TV", () => {
  it("mostra classifica e piatto, e si aggiorna da sola a ogni mano", async () => {
    const { id, repo } = await seed();
    render(<TvPage />);
    expect(await screen.findByText("Fa le carte Anna", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);

    await act(() =>
      repo.appendEvent(id, { type: "hand_played", winners: [{ playerIds: ["p2"], tricks: 3 }], losers: [["p3"]] }, "in_progress"),
    );
    // Carla prima in classifica con +0,30 €, piatto = 0,30 (bestia) + 0,30 (messa di Bruno)
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Carla");
    expect(norm(rows[0].textContent)).toContain("+0,30 €");
    expect(norm(document.body.textContent)).toContain("0,60 €");
    expect(screen.getByText(/vince Carla/)).toBeInTheDocument();
  });

  it("a fine partita mostra chi paga chi", async () => {
    const { id, repo } = await seed();
    await repo.appendEvent(id, { type: "hand_played", winners: [{ playerIds: ["p2"], tricks: 3 }], losers: [] }, "in_progress");
    await repo.appendEvent(id, { type: "game_ended" }, "ended");
    render(<TvPage />);
    expect(await screen.findByText("Chi paga chi")).toBeInTheDocument();
    expect(screen.getByText("Partita terminata", { exact: false })).toBeInTheDocument();
  });

  it("avvisa se la partita non è su questo dispositivo", async () => {
    route.id = "inesistente";
    render(<TvPage />);
    expect(await screen.findByText(/non trovata/)).toBeInTheDocument();
  });

  it("una bestia appena giocata compare a tutto schermo; all'apertura le mani vecchie no", async () => {
    const { id, repo } = await seed();
    await repo.appendEvent(id, { type: "hand_played", winners: [{ playerIds: ["p2"], tricks: 3 }], losers: [] }, "in_progress");
    render(<TvPage />);
    await screen.findByText("Fa le carte", { exact: false });
    expect(screen.queryByRole("status")).toBeNull();
    await act(() => repo.appendEvent(id, { type: "hand_played", winners: [{ playerIds: ["p0"], tricks: 3 }], losers: [["p3"]] }, "in_progress"));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("BESTIA!");
    expect(norm(status.textContent)).toContain("Dario paga 0,30 €");
  });

  it("i suoni partono spenti, con il pulsante per attivarli", async () => {
    await seed();
    render(<TvPage />);
    expect(await screen.findByRole("button", { name: /Attiva i suoni/ })).toHaveAttribute("aria-pressed", "false");
  });
});
