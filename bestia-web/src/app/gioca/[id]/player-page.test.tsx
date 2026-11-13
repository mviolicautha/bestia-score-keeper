// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRepository } from "@/lib/repository";
import { setOnlineForTests } from "@/lib/online";
import { resetCharacterCache } from "@/lib/avatar/store";
import { route } from "@/test/setup-next";
import { fakeOnline } from "@/test/fakeOnline";
import PlayerPage from "./page";
import JoinPage from "../../g/[code]/page";

vi.mock("next/navigation", async () => {
  const m = (await import("@/test/setup-next")).navigationMock;
  return { ...m, useParams: () => ({ id: route.id, code: "KX7P2" }) };
});
vi.mock("next/link", async () => ({ default: (await import("@/test/setup-next")).LinkMock }));

/** Intl mette uno spazio non separabile prima di "€": lo normalizziamo. */
const norm = (t: string | null | undefined) => (t ?? "").replace(/[  ]/g, " ");

beforeEach(() => {
  window.localStorage.clear();
  resetCharacterCache();
  route.pushed = [];
});
afterEach(() => {
  cleanup();
  setOnlineForTests(null);
});

/** Partita (salvata in locale per il test) con 5 giocatori; il servizio online è finto. */
async function seed(master = "u-master") {
  const repo = getRepository();
  const id = await repo.createGame("Venerdì", 30);
  for (const [i, name] of ["Anna", "Bruno", "Carla", "Dario", "Elena"].entries()) {
    await repo.appendEvent(id, { type: "player_added", playerId: `p${i}`, name }, "in_progress");
  }
  route.id = id;
  const online = fakeOnline({ id, code: "KX7P2", title: "Venerdì", masterId: master });
  setOnlineForTests(online.service);
  return { id, repo, online };
}

describe("unirsi dal telefono", () => {
  it("'Sono io' prende il posto e porta alla vista del giocatore; i posti presi non si possono scegliere", async () => {
    const { id, online } = await seed();
    online.state.seats.push({ playerId: "p0", profileId: "u-altro", character: null });
    render(<JoinPage />);
    expect(await screen.findByRole("heading", { name: "Venerdì" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anna, già collegato" })).toBeDisabled();

    await act(async () => screen.getByRole("button", { name: "Sono io: Carla" }).click());
    expect(online.calls.claimSeat).toHaveBeenCalledWith(id, "p2", "Carla", null);
    await vi.waitFor(() => expect(route.pushed).toContain(`/gioca/${id}`));
  });

  it("chi non è al tavolo chiede di sedersi, aspetta, ed entra da solo quando il master approva", async () => {
    const { id, repo, online } = await seed();
    render(<JoinPage />);
    const input = await screen.findByRole("textbox", { name: "Il tuo nome" });
    await act(async () => {
      (input as HTMLInputElement).value = "";
    });
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    await user.type(input, "Marco");
    await user.click(screen.getByRole("button", { name: "Chiedi" }));
    expect(await screen.findByText(/Aspetta che il master ti faccia sedere/)).toBeTruthy();

    // il master lo fa sedere come p5, ma l'approvazione arriva PRIMA dell'aggiornamento della partita:
    // il telefono non deve prendere un posto che ancora non vede (né andare in ciclo)
    await act(() => online.calls.decideRequest("r1", "approved", "p5"));
    await new Promise((r) => setTimeout(r, 50));
    expect(online.calls.claimSeat).not.toHaveBeenCalled();
    await act(() => repo.appendEvent(id, { type: "player_added", playerId: "p5", name: "Marco" }, "in_progress"));
    await vi.waitFor(() => expect(online.calls.claimSeat).toHaveBeenCalledWith(id, "p5", "Marco", null));
    expect(online.calls.claimSeat).toHaveBeenCalledTimes(1);
    expect(online.calls.releaseSeat).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(route.pushed).toContain(`/gioca/${id}`));
  });

  it("se il master ha annullato il giocatore di cui avevo preso il posto, posso sceglierne un altro", async () => {
    const { id, online } = await seed();
    online.state.seats.push({ playerId: "p-sparito", profileId: "u-io", character: null }); // posto "fantasma"
    render(<JoinPage />);
    // non vengo mandato alla partita per un posto che non esiste più
    const dario = await screen.findByRole("button", { name: "Sono io: Dario" });
    await act(async () => dario.click());
    await vi.waitFor(() => expect(online.calls.claimSeat).toHaveBeenCalledWith(id, "p3", "Dario", null));
    expect(online.calls.releaseSeat).toHaveBeenCalledWith(id, "p-sparito");
  });

  it("un codice inesistente lo dice chiaramente", async () => {
    await seed();
    route.id = "x";
    const online = fakeOnline({ id: "g-altro", code: "AAAAA", title: "Altra", masterId: "m" });
    setOnlineForTests(online.service);
    render(<JoinPage />);
    expect(await screen.findByText(/Nessuna partita con il codice KX7P2/)).toBeTruthy();
  });
});

describe("vista del giocatore", () => {
  it("mostra il mio saldo, quando tocca a me fare le carte e com'è andata l'ultima mano", async () => {
    const { repo, id, online } = await seed();
    online.state.seats.push({ playerId: "p1", profileId: "u-io", character: null }); // sono Bruno
    render(<PlayerPage />);
    expect(await screen.findByText("Bruno", { selector: "p" })).toBeTruthy();
    expect(screen.queryByText(/Tocca a te fare le carte/)).toBeNull();

    // Bruno vince 3/3 il piatto di Anna; poi tocca a lui fare le carte
    await act(() =>
      repo.appendEvent(id, { type: "hand_played", winners: [{ playerIds: ["p1"], tricks: 3 }], losers: [["p3"]] }, "in_progress"),
    );
    expect(await screen.findByText(/Tocca a te fare le carte/)).toBeTruthy();
    expect(norm(screen.getByText(/hai vinto/).textContent)).toContain("0,30 €");
    // +0,30 vinti, -0,30 di messa da nuovo mazziere
    expect(screen.getByLabelText("Il tuo saldo 0,00 €")).toBeTruthy();
  });

  it("a fine partita mostra solo i miei conti", async () => {
    const { repo, id, online } = await seed();
    online.state.seats.push({ playerId: "p3", profileId: "u-io", character: null }); // sono Dario
    for (const ev of [
      { type: "hand_played" as const, winners: [{ playerIds: ["p2"], tricks: 3 as const }], losers: [["p3"]] },
      { type: "hand_played" as const, winners: [{ playerIds: ["p2"], tricks: 3 as const }], losers: [] },
      { type: "game_ended" as const },
    ]) {
      await repo.appendEvent(id, ev, ev.type === "game_ended" ? "ended" : "in_progress");
    }
    render(<PlayerPage />);
    expect(await screen.findByRole("heading", { name: "I tuoi conti" })).toBeTruthy();
    expect(screen.getByText(/Devi dare a/).textContent).toContain("Carla");
  });

  it("se non ho preso un posto mi rimanda a scegliere chi sono", async () => {
    await seed();
    render(<PlayerPage />);
    expect(await screen.findByText(/Non hai ancora preso un posto/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Scegli chi sei" })).toHaveAttribute("href", "/g/KX7P2");
  });
});
