"use client";

import { useState } from "react";
import { Ban, Dices, Eraser } from "lucide-react";
import {
  catalog,
  DEFAULT_HAIR_COLOR,
  getItem,
  isEmpty,
  itemsOf,
  randomCharacter,
  withItem,
  type Category,
  type CharacterConfig,
} from "@/lib/avatar/catalog";
import { getCharacter, saveCharacter } from "@/lib/avatar/store";
import { Character, cropAround, CROPS } from "./Character";
import { Button, Sheet } from "./Sheet";

/** Crea o modifica il personaggio di un giocatore (salvato per nome, vale in tutte le partite). */
export function CharacterEditor({ name, onClose, onSaved }: { name: string; onClose: () => void; onSaved?: () => void }) {
  const [draft, setDraft] = useState<CharacterConfig>(() => getCharacter(name) ?? {});
  const [tab, setTab] = useState<Category>(catalog.categories[0]?.id ?? "hair");
  const items = itemsOf(tab);
  const hairColor = draft.hairColor ?? DEFAULT_HAIR_COLOR;

  // Le miniature mostrano il pezzo da solo, con i capelli nel colore scelto.
  const thumbConfig = (id: string): CharacterConfig => ({ [tab]: id, ...(tab === "hair" ? { hairColor } : {}) });
  const covered = tab !== "costume" && (tab === "outfit" || tab === "hat") && draft.costume;

  return (
    <Sheet open onClose={onClose} title={`Personaggio di ${name}`}>
      {/* Anteprima e schede restano in vista mentre si scorre l'elenco dei pezzi. */}
      <div className="sticky -top-5 z-10 -mx-5 bg-night-800 px-5 pb-1 pt-1">
        <div className="flex items-end gap-3">
          <div className="relative mx-auto w-36 shrink-0 overflow-hidden rounded-3xl bg-gradient-to-b from-night-600 to-night-900 ring-1 ring-white/10 sm:w-52">
            <Character config={draft} crop={CROPS.bust} label={`Anteprima del personaggio di ${name}`} />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Button variant="secondary" className="flex items-center justify-center gap-2 py-2.5 text-sm" onClick={() => setDraft(randomCharacter())}>
              <Dices size={18} /> Casuale
            </Button>
            <Button
              variant="ghost"
              className="flex items-center justify-center gap-2 py-2.5 text-sm"
              disabled={isEmpty(draft)}
              onClick={() => setDraft({})}
            >
              <Eraser size={18} /> Togli tutto
            </Button>
          </div>
        </div>

        <div role="tablist" aria-label="Parti del personaggio" className="-mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {catalog.categories.map((c) => {
            const chosen = getItem(draft[c.id]);
            return (
              <button
                key={c.id}
                role="tab"
                aria-selected={tab === c.id}
                onClick={() => setTab(c.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  tab === c.id ? "bg-white text-night-900" : "bg-night-700 text-white/75 hover:bg-night-600"
                }`}
              >
                {c.label}
                {chosen && <span className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${tab === c.id ? "bg-night-900" : "bg-gold-400"}`} />}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "hair" && draft.hair && (
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Colore dei capelli">
          {catalog.hairColors.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={hairColor === c.id}
              aria-label={c.label}
              title={c.label}
              onClick={() => setDraft({ ...draft, hairColor: c.id })}
              className={`h-8 w-8 rounded-full ring-2 transition ${hairColor === c.id ? "ring-white" : "ring-white/15"}`}
              style={{ background: c.hex ?? "conic-gradient(#6b4a30, #b07a4a, #e0b070, #6b4a30)" }}
            />
          ))}
        </div>
      )}

      {covered && <p className="mt-3 rounded-xl bg-amber-500/15 p-2.5 text-xs text-amber-200">Il costume copre già vestito e cappello: sceglierne uno toglie il costume.</p>}

      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4" role="listbox" aria-label={catalog.categories.find((c) => c.id === tab)?.label}>
        <li>
          <Tile label="Nessuno" selected={!draft[tab]} onClick={() => setDraft(withItem(draft, tab, null))}>
            <span className="grid aspect-square place-items-center text-white/30">
              <Ban size={28} />
            </span>
          </Tile>
        </li>
        {items.map((it) => (
          <li key={it.id}>
            <Tile label={it.label} selected={draft[tab] === it.id} onClick={() => setDraft(withItem(draft, tab, it.id))}>
              <Character config={thumbConfig(it.id)} crop={cropAround(it.box)} />
            </Tile>
          </li>
        ))}
      </ul>

      <div className="sticky -bottom-5 -mx-5 mt-4 flex gap-2 bg-night-800 px-5 pb-1 pt-3">
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          Annulla
        </Button>
        <Button
          className="flex-1"
          onClick={() => {
            saveCharacter(name, draft);
            onSaved?.();
            onClose();
          }}
        >
          Salva
        </Button>
      </div>
    </Sheet>
  );
}

function Tile({ label, selected, onClick, children }: { label: string; selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`w-full overflow-hidden rounded-2xl bg-night-900 text-left ring-2 transition active:scale-[0.97] ${
        selected ? "ring-gold-400" : "ring-white/5 hover:ring-white/20"
      }`}
    >
      <span className="block bg-gradient-to-b from-night-700 to-night-900">{children}</span>
      <span className="block truncate px-2 py-1.5 text-xs font-semibold text-white/80">{label}</span>
    </button>
  );
}
