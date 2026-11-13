"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { isEmpty, type CharacterConfig } from "@/lib/avatar/catalog";
import { Character, CROPS } from "./Character";

/** Pezzi in comune tra le pagine delle compagnie. */

export const inputClass =
  "mt-1 w-full rounded-xl bg-night-900 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-gold-400 aria-[invalid=true]:ring-red-400";

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Qualcosa è andato storto.");

/** Per le compagnie serve un account: rimanda alla pagina dell'account e poi torna qui. */
export function AccountRequired({ next, text }: { next: string; text?: string }) {
  return (
    <div className="rounded-3xl bg-night-800 p-5 text-center ring-1 ring-white/5">
      <UserRound size={32} className="mx-auto text-white/40" />
      <p className="mt-3 text-white/75">{text ?? "Per creare una compagnia o entrarci serve un account. Bastano username e password."}</p>
      <Link
        href={`/account?next=${encodeURIComponent(next)}`}
        className="mt-4 inline-block rounded-2xl bg-gold-400 px-5 py-3 font-bold text-night-950 hover:bg-gold-500"
      >
        Entra o crea un account
      </Link>
    </div>
  );
}

/** Faccina tonda di un membro: il suo personaggio, o l'iniziale. */
export function MemberFace({ name, character, size = "md" }: { name: string; character: CharacterConfig | null; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "size-14 text-xl" : "size-10";
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-night-600 font-bold text-white/75 ring-1 ring-white/10 ${dim}`} aria-hidden>
      {character && !isEmpty(character) ? (
        <Character config={character} crop={CROPS.head} className="h-full w-full" />
      ) : (
        name.trim().charAt(0).toUpperCase() || "?"
      )}
    </span>
  );
}
