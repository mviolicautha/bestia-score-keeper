// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdventPage from "./page";

vi.mock("next/link", async () => ({ default: (await import("@/test/setup-next")).LinkMock }));

const svc = {
  load: vi.fn(async () => ({ season: 2026, today: 7, opened: { 1: { type: "coins", coins: 100 } } })),
  open: vi.fn(async (day: number) => ({ day, reward: { type: "pack", pack: "oro" }, coins: 100, packs: { classica: 0, oro: 1 } })),
};
const applyAdventOpen = vi.fn();

vi.mock("@/lib/advent", async (orig) => ({ ...(await orig<typeof import("@/lib/advent")>()), getAdvent: () => svc }));
vi.mock("@/lib/avatar/collection", () => ({
  useCollection: () => ({ status: "ready", collection: {} }),
  applyAdventOpen: (...a: unknown[]) => applyAdventOpen(...a),
  refreshCollection: vi.fn(),
}));
vi.mock("@/lib/sounds", () => ({ play: vi.fn(), unlock: vi.fn(async () => {}) }));

afterEach(() => cleanup());

describe("calendario dell'avvento", () => {
  it("apre le caselle fino a oggi e mostra cosa c'era dentro", async () => {
    const user = userEvent.setup();
    render(<AdventPage />);
    expect(await screen.findByText(/6 caselle da aprire/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "8 dicembre, ancora chiusa" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /casella del 1 dicembre/ })).not.toBeInTheDocument(); // già aperta

    await user.click(screen.getByRole("button", { name: "Apri la casella del 6 dicembre" }));
    expect(svc.open).toHaveBeenCalledWith(6);
    expect(await screen.findByText("Una bustina d'oro!")).toBeInTheDocument();
    expect(applyAdventOpen).toHaveBeenCalledWith(100, { classica: 0, oro: 1 }, null);
    expect(screen.getByText(/5 caselle da aprire/)).toBeInTheDocument();
  });
});
