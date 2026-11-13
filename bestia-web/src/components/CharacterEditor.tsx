"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Dices, Eraser, Lock, PackageOpen } from "lucide-react";
import {
  catalog,
  DEFAULT_HAIR_COLOR,
  getItem,
  isEmpty,
  itemsOf,
  randomCharacter,
  withItem,
  type CatalogItem,
  type Category,
  type CharacterConfig,
} from "@/lib/avatar/catalog";
import { isFree, RARITIES, RARITY_INFO, rarityOf } from "@/lib/avatar/packs";
import type { Unlocked } from "@/lib/avatar/collection";
import { getCharacter, saveCharacter } from "@/lib/avatar/store";
import { Character, cropAround, CROPS } from "./Character";
import { Button, Sheet } from "./Sheet";

/**
 * Crea o modifica il personaggio di un giocatore (salvato per nome, vale in tutte le partite).
 *
 * `unlocked` dice quali pezzi si possono indossare: "all" senza bustine, altrimenti quelli
 * dell'album (i capelli sono sempre liberi). I pezzi che il personaggio indossa già restano
 * sceglibili anche se non sono nell'album. `collect` dice cosa proporre su un pezzo bloccato:
 * aprire le bustine (chi ha un account) o crearsi un account.
 */
export function CharacterEditor({
  name,
  onClose,
  onSaved,
  unlocked = "all",
  collect = "packs",
}: {
  name: string;
  onClose: () => void;
  onSaved?: () => void;
  unlocked?: Unlocked;
  collect?: "packs" | "account" | "none";
}) {
  const [draft, setDraft] = useState<CharacterConfig>(() => getCharacter(name) ?? {});
  // i pezzi indossati all'apertura: restano sceglibili (personaggi fatti prima delle bustine)
  const [worn] = useState(() => new Set(Object.values(getCharacter(name) ?? {}).filter((v): v is string => typeof v === "string")));
  const [tab, setTab] = useState<Category>(catalog.categories[0]?.id ?? "hair");
  const [hint, setHint] = useState<CatalogItem | null>(null);
  const hairColor = draft.hairColor ?? DEFAULT_HAIR_COLOR;

  const canWear = useMemo(
    () => (it: CatalogItem) => unlocked === "all" || isFree(it) || unlocked.has(it.id) || worn.has(it.id),
    [unlocked, worn],
  );
  // prima i pezzi che hai, poi quelli da trovare (dai più facili ai più rari)
  const items = useMemo(() => {
    const all = itemsOf(tab);
    if (unlocked === "all") return all;
    const rank = (it: CatalogItem) => (canWear(it) ? -1 : RARITIES.indexOf(rarityOf(it.id)));
    return [...all].sort((a, b) => rank(a) - rank(b));
  }, [tab, unlocked, canWear]);

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
            <Button
              variant="secondary"
              className="flex items-center justify-center gap-2 py-2.5 text-sm"
              onClick={() => setDraft(randomCharacter(Math.random, canWear))}
            >
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
            const list = itemsOf(c.id);
            const countable = unlocked !== "all" && list.length > 0 && !isFree(list[0]);
            return (
              <button
                key={c.id}
                role="tab"
                aria-selected={tab === c.id}
                onClick={() => {
                  setTab(c.id);
                  setHint(null);
                }}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  tab === c.id ? "bg-white text-night-900" : "bg-night-700 text-white/75 hover:bg-night-600"
                }`}
              >
                {c.label}
                {countable && (
                  <span className={`ml-1.5 text-xs font-bold tabular ${tab === c.id ? "text-night-900/55" : "text-white/40"}`} aria-hidden>
                    {list.filter(canWear).length}/{list.length}
                  </span>
                )}
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

      {hint && <LockedHint item={hint} collect={collect} onClose={() => setHint(null)} />}

      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4" role="listbox" aria-label={catalog.categories.find((c) => c.id === tab)?.label}>
        <li>
          <Tile label="Nessuno" selected={!draft[tab]} onClick={() => setDraft(withItem(draft, tab, null))}>
            <span className="grid aspect-square place-items-center text-white/30">
              <Ban size={28} />
            </span>
          </Tile>
        </li>
        {items.map((it) => {
          const locked = !canWear(it);
          const rarity = unlocked !== "all" && !isFree(it) ? rarityOf(it.id) : null;
          return (
            <li key={it.id}>
              <Tile
                label={it.label}
                selected={draft[tab] === it.id}
                locked={locked}
                rarityColor={rarity ? RARITY_INFO[rarity].color : undefined}
                onClick={() => {
                  if (locked) setHint(it);
                  else {
                    setHint(null);
                    setDraft(withItem(draft, tab, it.id));
                  }
                }}
              >
                <Character config={thumbConfig(it.id)} crop={cropAround(it.box)} className={locked ? "opacity-40 grayscale" : ""} />
              </Tile>
            </li>
          );
        })}
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

function LockedHint({ item, collect, onClose }: { item: CatalogItem; collect: "packs" | "account" | "none"; onClose: () => void }) {
  const r = RARITY_INFO[rarityOf(item.id)];
  return (
    <div
      role="status"
      className="mt-3 flex items-center gap-3 rounded-2xl bg-night-900 p-3 ring-1"
      style={{ ["--tw-ring-color" as string]: r.glow }}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${r.color}26`, color: r.color }}>
        <Lock size={20} />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate font-bold">
          {item.label} <span style={{ color: r.color }}>· {r.label}</span>
        </p>
        <p className="text-xs text-white/55">
          {collect === "packs"
            ? "Non ce l'hai ancora: si trova nelle bustine."
            : collect === "account"
              ? "I pezzi si collezionano aprendo bustine: serve un account."
              : "Lo può sbloccare solo chi lo indossa, aprendo bustine col suo account."}
        </p>
      </div>
      {collect === "packs" && (
        <Link href="/bustine" className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gold-400 px-3 py-2 text-sm font-bold text-night-950">
          <PackageOpen size={16} /> Bustine
        </Link>
      )}
      {collect === "account" && (
        <Link href="/account" className="shrink-0 rounded-xl bg-gold-400 px-3 py-2 text-sm font-bold text-night-950">
          Account
        </Link>
      )}
      {collect === "none" && (
        <button onClick={onClose} className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-white/60 hover:bg-white/10">
          Ok
        </button>
      )}
    </div>
  );
}

function Tile({
  label,
  selected,
  locked = false,
  rarityColor,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  locked?: boolean;
  rarityColor?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="option"
      aria-selected={selected}
      aria-disabled={locked || undefined}
      aria-label={locked ? `${label} (da trovare nelle bustine)` : undefined}
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-2xl bg-night-900 text-left ring-2 transition active:scale-[0.97] ${
        selected ? "ring-gold-400" : "ring-white/5 hover:ring-white/20"
      }`}
    >
      <span className="block bg-gradient-to-b from-night-700 to-night-900">{children}</span>
      {locked && (
        <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-night-950/80 text-white/70 ring-1 ring-white/10">
          <Lock size={13} />
        </span>
      )}
      <span className={`flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold ${locked ? "text-white/40" : "text-white/80"}`}>
        {rarityColor && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: rarityColor }} aria-hidden />}
        <span className="truncate">{label}</span>
      </span>
    </button>
  );
}
