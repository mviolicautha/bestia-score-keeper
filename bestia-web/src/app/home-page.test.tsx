// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRepository } from "@/lib/repository";
import { route } from "@/test/setup-next";
import Home from "./page";

vi.mock("next/navigation", async () => (await import("@/test/setup-next")).navigationMock);
vi.mock("next/link", async () => ({ default: (await import("@/test/setup-next")).LinkMock }));
vi.mock("next/image", async () => ({ default: (await import("@/test/setup-next")).ImageMock }));

beforeEach(() => {
  window.localStorage.clear();
  route.pushed = [];
  // jsdom non implementa matchMedia (serve per capire se l'app è installata).
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q })) as unknown as typeof window.matchMedia;
});
afterEach(() => cleanup());

describe("home", () => {
  it("crea una partita con la messa scelta e apre la schermata del master", async () => {
    const user = userEvent.setup();
    render(<Home />);
    expect(await screen.findByText(/Nessuna partita ancora/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Nuova partita/ }));
    await user.type(screen.getByLabelText("Nome della serata"), "Venerdì");
    await user.click(screen.getByRole("button", { name: "Aumenta messa" }));
    await user.click(screen.getByRole("button", { name: /Crea e aggiungi/ }));

    await waitFor(() => expect(route.pushed).toHaveLength(1));
    const games = await getRepository().listGames();
    expect(games[0].title).toBe("Venerdì");
    expect((await getRepository().loadEvents(games[0].id))[0].event).toEqual({ type: "game_started", baseBetCents: 60 });
  });

  it("elenca le partite con il riepilogo ed elimina solo dopo conferma", async () => {
    const repo = getRepository();
    const id = await repo.createGame("Sabato", 30);
    for (const [i, name] of ["Anna", "Bruno", "Carla", "Dario", "Elena"].entries()) {
      await repo.appendEvent(id, { type: "player_added", playerId: `p${i}`, name }, "in_progress");
    }
    const user = userEvent.setup();
    render(<Home />);
    expect(await screen.findByText("Sabato")).toBeInTheDocument();
    expect(screen.getByText(/5 giocatori · 0 mani/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Elimina Sabato" }));
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(await repo.listGames()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Elimina Sabato" }));
    await user.click(screen.getByRole("button", { name: "Elimina" }));
    await waitFor(async () => expect(await repo.listGames()).toHaveLength(0));
    expect(await screen.findByText(/Nessuna partita ancora/)).toBeInTheDocument();
  });
});
