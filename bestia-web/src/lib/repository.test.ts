import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "./repository";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("newId", () => {
  it("funziona anche senza crypto.randomUUID (pagina aperta via http dal telefono)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) });
    const ids = new Set(Array.from({ length: 1000 }, newId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it("usa randomUUID quando c'è", () => {
    expect(newId()).toMatch(UUID_V4);
  });
});
