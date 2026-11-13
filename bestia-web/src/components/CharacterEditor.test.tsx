// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCharacter, resetCharacterCache, saveCharacter } from "@/lib/avatar/store";
import { CharacterEditor } from "./CharacterEditor";

vi.mock("next/link", async () => ({ default: (await import("@/test/setup-next")).LinkMock }));

beforeEach(() => {
  window.localStorage.clear();
  resetCharacterCache();
});
afterEach(() => cleanup());

describe("editor del personaggio con le bustine", () => {
  it("i capelli sono liberi; gli altri pezzi solo se sono nell'album", async () => {
    const user = userEvent.setup();
    render(<CharacterEditor name="Anna" onClose={() => {}} unlocked={new Set(["glasses_sun_black"])} />);
    const editor = screen.getByRole("dialog", { name: "Personaggio di Anna" });

    await user.click(within(editor).getByRole("option", { name: "Corti" }));
    expect(within(editor).getByRole("option", { name: "Corti" })).toHaveAttribute("aria-selected", "true");

    const tab = within(editor).getByRole("tab", { name: /Occhiali/ });
    expect(tab).toHaveTextContent("1/4");
    await user.click(tab);
    // bloccato: non si indossa, compare il suggerimento con il link alle bustine
    await user.click(within(editor).getByRole("option", { name: "Specchiati (da trovare nelle bustine)" }));
    expect(within(editor).getByRole("option", { name: "Specchiati (da trovare nelle bustine)" })).toHaveAttribute("aria-selected", "false");
    expect(within(editor).getByRole("status")).toHaveTextContent("si trova nelle bustine");
    expect(within(editor).getByRole("link", { name: /Bustine/ })).toHaveAttribute("href", "/bustine");

    // posseduto: si indossa ed è il primo dell'elenco
    const options = within(editor).getAllByRole("option");
    expect(options[1]).toHaveAccessibleName("Da sole");
    await user.click(options[1]);
    await user.click(within(editor).getByRole("button", { name: "Salva" }));
    expect(getCharacter("Anna")).toEqual({ hair: "hair_short", glasses: "glasses_sun_black" });
  });

  it("i pezzi che il personaggio indossava già restano sceglibili", async () => {
    saveCharacter("Bruno", { hat: "hat_cowboy" });
    const user = userEvent.setup();
    render(<CharacterEditor name="Bruno" onClose={() => {}} unlocked={new Set()} collect="none" />);
    const editor = screen.getByRole("dialog", { name: "Personaggio di Bruno" });
    await user.click(within(editor).getByRole("tab", { name: /Cappello/ }));
    expect(within(editor).getByRole("option", { name: "Cowboy" })).toHaveAttribute("aria-selected", "true");
    await user.click(within(editor).getByRole("option", { name: "Nessuno" }));
    await user.click(within(editor).getByRole("option", { name: "Cowboy" }));
    expect(within(editor).getByRole("option", { name: "Cowboy" })).toHaveAttribute("aria-selected", "true");
  });

  it("senza bustine è tutto libero, come prima", async () => {
    const user = userEvent.setup();
    render(<CharacterEditor name="Carla" onClose={() => {}} unlocked="all" />);
    const editor = screen.getByRole("dialog", { name: "Personaggio di Carla" });
    await user.click(within(editor).getByRole("tab", { name: "Occhiali" }));
    await user.click(within(editor).getByRole("option", { name: "Specchiati" }));
    expect(within(editor).getByRole("option", { name: "Specchiati" })).toHaveAttribute("aria-selected", "true");
  });
});
