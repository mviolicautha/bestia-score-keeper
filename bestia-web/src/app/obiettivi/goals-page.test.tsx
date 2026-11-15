// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Goals } from "@/lib/goals";
import GoalsPage from "./page";

vi.mock("next/link", async () => ({ default: (await import("@/test/setup-next")).LinkMock }));

const goals: Goals = {
  achievements: [
    { id: "partite_1", value: 1, goal: 1, claimed: false },
    { id: "partite_3", value: 1, goal: 3, claimed: false },
    { id: "nick_bancomat", value: 1, goal: 1, claimed: true },
  ],
  week: "2026-11-16",
  challenges: [
    { id: "w_partita", value: 1, goal: 1, claimed: false },
    { id: "w_mani_25", value: 10, goal: 25, claimed: false },
    { id: "w_bestia", value: 0, goal: 1, claimed: false },
  ],
  bonusClaimed: false,
  coins: 200,
  packs: { classica: 0, oro: 0 },
};

const svc = {
  backfill: vi.fn(async () => 0),
  load: vi.fn(async () => structuredClone(goals)),
  claim: vi.fn(async (ids: string[]) => ({ claimed: ids, coins: 240, packs: { classica: 1, oro: 0 } })),
};

vi.mock("@/lib/goals", async (orig) => ({ ...(await orig<typeof import("@/lib/goals")>()), getGoals: () => svc }));
vi.mock("@/lib/avatar/collection", () => ({
  useCollection: () => ({ status: "ready", collection: {} }),
  applyGoalsClaim: vi.fn(),
  refreshCollection: vi.fn(),
}));
vi.mock("@/lib/sounds", () => ({ play: vi.fn(), unlock: vi.fn(async () => {}) }));

afterEach(() => cleanup());

describe("obiettivi", () => {
  it("completa le partite vecchie, mostra sfide e obiettivi e riscuote tutto", async () => {
    const user = userEvent.setup();
    render(<GoalsPage />);
    expect(await screen.findByText("Sfide della settimana")).toBeInTheDocument();
    expect(svc.backfill).toHaveBeenCalled();
    expect(screen.getByText("Gioca 25 mani")).toBeInTheDocument();
    expect(screen.getByText("10/25")).toBeInTheDocument();
    expect(screen.getByText("Prima partita")).toBeInTheDocument();
    // premi pronti: bustina classica + 40 gettoni della sfida
    expect(screen.getByText("40 gettoni + 1 bustina classica")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Riscuoti tutto \(2\)/ }));
    await waitFor(() => expect(svc.claim).toHaveBeenCalledWith(["partite_1", "w:w_partita"]));
    expect(await screen.findByText(/1 bustina vinta/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Riscuoti tutto/ })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/Riscoss/).length).toBe(3);
  });
});
