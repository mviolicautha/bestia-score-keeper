// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACHIEVEMENT_BY_ID } from "@/lib/achievements";
import type { GameUnlocks, UnlocksService } from "@/lib/unlocks";
import { UnlockedPopup } from "./UnlockedPopup";

vi.mock("next/link", async () => ({ default: (await import("@/test/setup-next")).LinkMock }));
vi.mock("@/lib/sounds", () => ({ play: vi.fn(), unlock: vi.fn(async () => {}) }));
vi.mock("@/lib/avatar/collection", () => ({ refreshCollection: vi.fn() }));

const done: GameUnlocks = {
  ready: true,
  players: [
    { playerId: "p1", name: "Anna", mine: true, achievements: [ACHIEVEMENT_BY_ID.tripla_bestia, ACHIEVEMENT_BY_ID.mani_di_burro] },
    { playerId: "p2", name: "Bruno", mine: false, achievements: [ACHIEVEMENT_BY_ID.re_1] },
  ],
};

function fakeService(answers: GameUnlocks[]) {
  const ofGame = vi.fn(async () => answers.shift() ?? done);
  return { svc: { ofGame } as unknown as UnlocksService, ofGame };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("festa al tavolo sul telefono", () => {
  it("aspetta i risultati del master, poi mostra solo i miei obiettivi", async () => {
    const { svc, ofGame } = fakeService([{ ready: false, players: [] }]);
    render(<UnlockedPopup gameId="g1" ended svc={svc} />);
    await act(() => vi.advanceTimersByTimeAsync(1600));
    expect(ofGame).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(4100));
    expect(ofGame).toHaveBeenCalledTimes(2);
    expect(screen.getByText("2 obiettivi!")).toBeInTheDocument();
    expect(screen.getByText("Tripla bestia")).toBeInTheDocument();
    expect(screen.queryByText("Re per una notte")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Riscuoti/ })).toHaveAttribute("href", "/obiettivi");

    fireEvent.click(screen.getByRole("button", { name: "Dopo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("una volta chiuso non ricompare per la stessa partita", async () => {
    window.localStorage.setItem("bestia:festa:g1", "1");
    const { svc } = fakeService([]);
    render(<UnlockedPopup gameId="g1" ended svc={svc} />);
    await act(() => vi.advanceTimersByTimeAsync(1600));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("niente se la partita non è finita", async () => {
    const { svc, ofGame } = fakeService([]);
    render(<UnlockedPopup gameId="g1" ended={false} svc={svc} />);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(ofGame).not.toHaveBeenCalled();
  });
});
