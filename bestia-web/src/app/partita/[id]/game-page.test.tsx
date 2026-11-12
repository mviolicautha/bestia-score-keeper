// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@/engine";
import { getRepository } from "@/lib/repository";
import { route } from "@/test/setup-next";
import GamePage from "./page";

vi.mock("next/navigation", async () => (await import("@/test/setup-next")).navigationMock);
vi.mock("next/link", async () => ({ default: (await import("@/test/setup-next")).LinkMock }));

const NAMES = ["Anna", "Bruno", "Carla", "Dario", "Elena"];

/** Crea una partita salvata con i giocatori indicati (e altri eventi opzionali), poi apre la schermata del master. */
async function openGame(names: string[] = NAMES, extra: GameEvent[] = []) {
  const repo = getRepository();
  const id = await repo.createGame("Test", 30);
  for (const [i, name] of names.entries()) {
    await repo.appendEvent(id, { type: "player_added", playerId: `p${i}`, name }, "in_progress");
  }
  for (const ev of extra) await repo.appendEvent(id, ev, "in_progress");
  route.id = id;
  render(<GamePage />);
  await screen.findByText(/Messa 0,30 €/);
  return { id, repo, user: userEvent.setup() };
}

/** Intl usa uno spazio non separabile prima di "€": lo normalizziamo per confrontare i testi. */
const norm = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ");
const card = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });
const balanceOf = (name: string) => norm(card(name).getAttribute("aria-label")).match(/saldo (.+? €)/)![1];
const pot = () => norm(document.querySelector("section p.text-5xl")?.textContent);
const eventTypes = async (id: string) => (await getRepository().loadEvents(id)).map((e) => e.event.type);

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("schermata del master", () => {
  it("se la partita non esiste lo dice e offre di tornare indietro", async () => {
    route.id = "inesistente";
    render(<GamePage />);
    expect(await screen.findByText(/non trovata su questo dispositivo/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Torna alle partite" })).toBeTruthy();
  });

  it("aggiunge i giocatori in ordine: il primo fa le carte e versa la messa", async () => {
    const { user } = await openGame([]);
    expect(screen.getByRole("button", { name: /^Passa/ })).toBeDisabled();
    expect(screen.getByText(/Servono almeno 5 giocatori \(0\/5\)/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Aggiungi giocatore" }));
    const input = screen.getByRole("textbox", { name: "Nome del giocatore" });
    for (const n of NAMES) {
      await user.type(input, `${n}{Enter}`);
      await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
    }
    await user.click(screen.getByRole("button", { name: "Fatto" }));

    expect(card("Anna").getAttribute("aria-label")).toContain("mazziere");
    expect(balanceOf("Anna")).toBe("-0,30 €");
    expect(pot()).toBe("0,30 €");
    expect(screen.getByRole("button", { name: /^Passa/ })).toBeEnabled();
  });

  it("rifiuta un nome già presente con un messaggio", async () => {
    const { user } = await openGame();
    await user.click(screen.getByRole("button", { name: "Aggiungi giocatore" }));
    await user.type(screen.getByRole("textbox", { name: "Nome del giocatore" }), "anna{Enter}");
    expect(await screen.findByText(/C'è già un giocatore chiamato anna/)).toBeTruthy();
  });

  it("gioca una mano completa: 2/3 e 1/3, una bestia, anteprima degli importi", async () => {
    const { id, user } = await openGame();
    await user.click(screen.getByRole("button", { name: "Gioca mano" }));
    await user.click(card("Carla"));
    await user.click(card("Elena"));

    // Con due vincitori bisogna dire chi ha fatto 2 prese.
    expect(screen.getByRole("button", { name: "Avanti" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Carla" }));
    expect(within(card("Carla")).getByText("+0,20 €")).toBeTruthy();
    expect(within(card("Carla")).getByText("2/3")).toBeTruthy();
    expect(within(card("Elena")).getByText("+0,10 €")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Avanti" }));
    await user.click(card("Dario"));
    expect(norm(screen.getByText(/nuovo piatto/).textContent)).toContain("0,60 €");
    await user.click(screen.getByRole("button", { name: "Fine mano" }));

    await screen.findByText(/Mano registrata/);
    expect(balanceOf("Carla")).toBe("+0,20 €");
    expect(balanceOf("Elena")).toBe("+0,10 €");
    expect(balanceOf("Dario")).toBe("-0,30 €");
    expect(balanceOf("Bruno")).toBe("-0,30 €"); // nuovo mazziere, versa la messa
    expect(pot()).toBe("0,60 €");
    expect(card("Bruno").getAttribute("aria-label")).toContain("mazziere");
    expect((await eventTypes(id)).at(-1)).toBe("hand_played");
  });

  it("società: due giocatori uniti si dividono la vincita", async () => {
    const { user } = await openGame();
    await user.click(screen.getByRole("button", { name: "Gioca mano" }));
    await user.click(card("Bruno"));
    await user.click(screen.getByRole("button", { name: /Società/ }));
    expect(screen.getByText(/tocca chi si unisce a Bruno/)).toBeTruthy();
    await user.click(card("Carla"));
    expect(within(card("Bruno")).getByText("3/3")).toBeTruthy();
    expect(within(card("Carla")).getByText("3/3")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Avanti" }));
    await user.click(screen.getByRole("button", { name: "Nessuna bestia" }));
    await screen.findByText(/Mano registrata/);
    expect(balanceOf("Bruno")).toBe("-0,15 €"); // +0,15 di vincita, -0,30 di messa (nuovo mazziere)
    expect(balanceOf("Carla")).toBe("+0,15 €");
  });

  it("un vincitore in bestia chiede conferma", async () => {
    const { user } = await openGame();
    await user.click(screen.getByRole("button", { name: "Gioca mano" }));
    await user.click(card("Anna"));
    await user.click(screen.getByRole("button", { name: "Avanti" }));

    await user.click(card("Anna"));
    expect(screen.getByRole("dialog", { name: "Vincitore anche in bestia?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(card("Anna").getAttribute("aria-pressed")).toBe("false");

    await user.click(card("Anna"));
    await user.click(screen.getByRole("button", { name: "Sì, va in bestia" }));
    expect(card("Anna").getAttribute("aria-pressed")).toBe("true");
  });

  it("un doppio tocco su Passa o Fine mano registra una sola azione", async () => {
    const { id, user } = await openGame();
    const pass = screen.getByRole("button", { name: /^Passa/ });
    act(() => {
      fireEvent.click(pass);
      fireEvent.click(pass);
    });
    await screen.findByText(/Mano passata/);
    await waitFor(async () => expect((await eventTypes(id)).filter((t) => t === "hand_passed")).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Gioca mano" }));
    await user.click(card("Carla"));
    await user.click(screen.getByRole("button", { name: "Avanti" }));
    const end = screen.getByRole("button", { name: "Nessuna bestia" });
    act(() => {
      fireEvent.click(end);
      fireEvent.click(end);
    });
    await screen.findByText(/Mano registrata/);
    expect((await eventTypes(id)).filter((t) => t === "hand_played")).toHaveLength(1);
  });

  it("annulla l'ultima azione e lo dice", async () => {
    const { id, user } = await openGame();
    await user.click(screen.getByRole("button", { name: /^Passa/ }));
    await waitFor(() => expect(pot()).toBe("0,60 €"));
    await user.click(screen.getByRole("button", { name: "Annulla ultima azione" }));
    expect(await screen.findByText("Annullato: Mano passata")).toBeTruthy();
    expect(pot()).toBe("0,30 €");
    expect(await eventTypes(id)).not.toContain("hand_passed");
  });

  it("a piatto sporco non si aggiungono giocatori e non si chiude la partita", async () => {
    const { user } = await openGame(NAMES, [{ type: "hand_passed" }]);
    expect(screen.getByRole("button", { name: "Aggiungi giocatore" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Altre opzioni" }));
    expect(screen.getByRole("button", { name: /Aggiungi giocatore.*sola messa/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Termina partita/ }));
    expect(screen.getByText(/Il piatto contiene ancora 0,60 €/)).toBeTruthy();
  });

  it("cambia la messa a piatto pulito", async () => {
    const { user } = await openGame();
    await user.click(screen.getByRole("button", { name: "Altre opzioni" }));
    await user.click(screen.getByRole("button", { name: /Messa del mazziere/ }));
    await user.click(screen.getByRole("button", { name: "Aumenta" }));
    await user.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(pot()).toBe("0,60 €"));
    expect(balanceOf("Anna")).toBe("-0,60 €");
  });

  it("un giocatore lascia il tavolo e può rientrare", async () => {
    const { user } = await openGame([...NAMES, "Fabio"]);
    await user.click(card("Fabio"));
    await user.click(screen.getByRole("button", { name: /Lascia il tavolo/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Fabio,/ })).toBeNull());
    expect(screen.getByText("Fuori dal tavolo")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Aggiungi giocatore" }));
    await user.click(screen.getByRole("button", { name: "Fabio" }));
    await waitFor(() => expect(screen.queryByText("Fuori dal tavolo")).toBeNull());
  });

  it("termina la partita, mostra chi paga chi e permette di riaprirla", async () => {
    const { user } = await openGame(NAMES, [
      { type: "hand_passed" },
      { type: "hand_played", winners: [{ playerIds: ["p2"], tricks: 3 }], losers: [] },
    ]);
    await user.click(screen.getByRole("button", { name: "Altre opzioni" }));
    await user.click(screen.getByRole("button", { name: /Termina partita/ }));
    await user.click(screen.getByRole("button", { name: "Termina e calcola i conti" }));

    expect(await screen.findByText("Chi paga chi")).toBeTruthy();
    expect(screen.getByText(/Vince la serata/)).toBeTruthy();
    // Carla ha preso 0,60 €; Anna e Bruno avevano versato 0,30 € ciascuno.
    const transfers = screen.getAllByText("0,30 €").length;
    expect(transfers).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole("button", { name: /Riapri la partita/ }));
    expect(await screen.findByRole("button", { name: "Gioca mano" })).toBeTruthy();
  });
});
