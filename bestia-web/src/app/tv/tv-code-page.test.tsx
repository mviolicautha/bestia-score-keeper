// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { route } from "@/test/setup-next";
import TvCodePage from "./page";

vi.mock("next/navigation", async () => (await import("@/test/setup-next")).navigationMock);

beforeEach(() => {
  route.pushed = [];
});
afterEach(() => cleanup());

describe("pagina /tv: si scrive solo il codice", () => {
  it("il campo è già pronto e al quinto carattere apre la partita, senza badare alle minuscole", async () => {
    const user = userEvent.setup();
    render(<TvCodePage />);
    const input = screen.getByLabelText("Scrivi il codice della partita");
    expect(input).toHaveFocus();

    await user.keyboard("kx7p");
    expect(input).toHaveValue("KX7P");
    expect(screen.getByRole("button", { name: "Apri la vista TV" })).toBeDisabled();
    expect(route.pushed).toEqual([]);

    await user.keyboard("2");
    expect(route.pushed).toEqual(["/t/KX7P2"]);
  });

  it("toglie spazi e trattini e non va oltre i 5 caratteri", async () => {
    const user = userEvent.setup();
    render(<TvCodePage />);
    await user.type(screen.getByLabelText("Scrivi il codice della partita"), "ab-1 2c9");
    expect(route.pushed).toEqual(["/t/AB12C"]);
    expect(screen.getByLabelText("Scrivi il codice della partita")).toHaveValue("AB12C");
  });
});
