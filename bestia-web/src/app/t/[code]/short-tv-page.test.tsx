// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setOnlineForTests } from "@/lib/online";
import { route } from "@/test/setup-next";
import { fakeOnline } from "@/test/fakeOnline";
import ShortTvPage from "./page";

vi.mock("next/navigation", async () => (await import("@/test/setup-next")).navigationMock);
vi.mock("next/link", async () => ({ default: (await import("@/test/setup-next")).LinkMock }));

const GAME = { id: "g-uuid-1", code: "KX7P2", title: "Venerdì", masterId: "u-master" };

beforeEach(() => {
  route.pushed = [];
});
afterEach(() => {
  cleanup();
  setOnlineForTests(null);
});

describe("link corto della vista TV (/t/[code])", () => {
  it("trova la partita dal codice, anche scritto in minuscolo, e apre la vista TV", async () => {
    const online = fakeOnline({ ...GAME }, "u-tv");
    setOnlineForTests(online.service);
    route.code = "kx7p2";
    render(<ShortTvPage />);
    await waitFor(() => expect(route.pushed).toEqual([`/tv/${GAME.id}`]));
    expect(online.calls.findGameByCode).toHaveBeenCalledWith("KX7P2");
  });

  it("con un codice sbagliato lo dice e propone di scriverne un altro", async () => {
    setOnlineForTests(fakeOnline({ ...GAME }, "u-tv").service);
    route.code = "zzzzz";
    render(<ShortTvPage />);
    expect(await screen.findByText("Nessuna partita con il codice ZZZZZ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Scrivi un altro codice" })).toHaveAttribute("href", "/tv");
    expect(route.pushed).toEqual([]);
  });

  it("se la ricerca non va a buon fine non dice che la partita non esiste", async () => {
    const online = fakeOnline({ ...GAME }, "u-tv");
    online.calls.findGameByCode.mockRejectedValueOnce(new Error("rete"));
    setOnlineForTests(online.service);
    route.code = "KX7P2";
    render(<ShortTvPage />);
    expect(await screen.findByText("Non riesco a cercare la partita")).toBeInTheDocument();
  });
});
