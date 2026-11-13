// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRepository } from "@/lib/repository";
import { setOnlineForTests } from "@/lib/online";
import { resetCharacterCache } from "@/lib/avatar/store";
import { route } from "@/test/setup-next";
import { fakeOnline } from "@/test/fakeOnline";
import GamePage from "./page";

vi.mock("next/navigation", async () => (await import("@/test/setup-next")).navigationMock);
vi.mock("next/link", async () => ({ default: (await import("@/test/setup-next")).LinkMock }));

beforeEach(() => {
  window.localStorage.clear();
  resetCharacterCache();
});
afterEach(() => {
  cleanup();
  setOnlineForTests(null);
});

/** Partita con 5 giocatori; questo dispositivo è il master (u-io). */
async function openAsMaster() {
  const repo = getRepository();
  const id = await repo.createGame("Venerdì", 30);
  for (const [i, name] of ["Anna", "Bruno", "Carla", "Dario", "Elena"].entries()) {
    await repo.appendEvent(id, { type: "player_added", playerId: `p${i}`, name }, "in_progress");
  }
  route.id = id;
  const online = fakeOnline({ id, code: "KX7P2", title: "Venerdì", masterId: "u-io" });
  setOnlineForTests(online.service);
  render(<GamePage />);
  await screen.findByText(/Messa 0,30 €/);
  return { id, repo, online, user: userEvent.setup() };
}

const order = () => screen.getAllByRole("button", { name: /, saldo/ }).map((b) => b.getAttribute("aria-label")!.split(",")[0]);

describe("master con giocatori dal telefono", () => {
  it("una richiesta di sedersi compare da sola; 'Fai sedere' lo mette nel posto scelto e avvisa il suo telefono", async () => {
    const { online, user } = await openAsMaster();
    await online.calls.requestToJoin("x", "Marco"); // arriva dal telefono di qualcun altro
    const banner = await screen.findByRole("list", { name: "Richieste di sedersi" });
    expect(within(banner).getByText("Marco")).toBeTruthy();

    await user.click(within(banner).getByRole("button", { name: "Fai sedere" }));
    const dialog = screen.getByRole("dialog", { name: "Fai sedere Marco" });
    await user.click(within(dialog).getByRole("radio", { name: /Bruno/ }));
    await user.click(within(dialog).getByRole("button", { name: "Fai sedere" }));

    await waitFor(() => expect(order()).toEqual(["Anna", "Bruno", "Marco", "Carla", "Dario", "Elena"]));
    const call = online.calls.decideRequest.mock.calls.at(-1)!;
    expect(call[1]).toBe("approved");
    expect(typeof call[2]).toBe("string"); // l'id del nuovo giocatore, per il suo telefono
    expect(await screen.findByText("Marco si siede al tavolo")).toBeTruthy();
  });

  it("se al tavolo c'è già qualcuno con quel nome, si collega il suo telefono a lui invece di duplicarlo", async () => {
    const { online, user } = await openAsMaster();
    await online.calls.requestToJoin("x", "carla "); // nome uguale, scritto diverso
    await user.click(within(await screen.findByRole("list", { name: "Richieste di sedersi" })).getByRole("button", { name: "Fai sedere" }));
    await user.click(screen.getByRole("button", { name: "È lui: collega il suo telefono" }));
    await waitFor(() => expect(online.calls.decideRequest).toHaveBeenCalledWith("r1", "approved", "p2"));
    expect(order()).toEqual(["Anna", "Bruno", "Carla", "Dario", "Elena"]); // nessun doppione
  });

  it("si può rifiutare una richiesta; a piatto sporco non si fa sedere nessuno", async () => {
    const { repo, id, online, user } = await openAsMaster();
    await repo.appendEvent(id, { type: "hand_passed" }, "in_progress"); // piatto 0,60: non pulito
    await online.calls.requestToJoin("x", "Zeno");
    await user.click(within(await screen.findByRole("list", { name: "Richieste di sedersi" })).getByRole("button", { name: "Fai sedere" }));
    const dialog = screen.getByRole("dialog", { name: "Fai sedere Zeno" });
    expect(within(dialog).getByText(/solo a piatto pulito/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Fai sedere" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Rifiuta" }));
    await waitFor(() => expect(online.calls.decideRequest).toHaveBeenCalledWith("r1", "rejected", undefined));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Richieste di sedersi" })).toBeNull());
  });

  it("nella scheda del giocatore si vede chi segue dal telefono e lo si può scollegare", async () => {
    const { id, online, user } = await openAsMaster();
    online.state.seats.push({ playerId: "p1", profileId: "u-bruno", character: { glasses: "glasses_sun_black" } });
    online.notify();
    // il personaggio creato sul telefono di Bruno compare al tavolo
    await waitFor(() => expect(screen.getByRole("button", { name: /^Bruno,/ }).querySelector('img[data-layer="glasses_sun_black"]')).not.toBeNull());
    await user.click(screen.getByRole("button", { name: /^Bruno,/ }));
    expect(screen.getByText("Segue la partita dal suo telefono")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Scollega" }));
    await waitFor(() => expect(online.calls.releaseSeat).toHaveBeenCalledWith(id, "p1"));
  });
});
