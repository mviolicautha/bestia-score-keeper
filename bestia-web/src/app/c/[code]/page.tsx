"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, UserPlus } from "lucide-react";
import { getGroups, normalizeGroupCode, type InvitePreview } from "@/lib/groups";
import { useAccount } from "@/lib/useAccount";
import { Button } from "@/components/Sheet";
import { AccountRequired, inputClass, MemberFace, messageOf } from "@/components/groupUi";

/**
 * Invito a una compagnia (link o QR): chi entra sceglie il suo nome tra i membri senza account
 * ("Sono io") oppure entra come nuovo.
 */
export default function JoinGroupPage() {
  const { code: raw } = useParams<{ code: string }>();
  const code = normalizeGroupCode(raw);
  const router = useRouter();
  const groups = getGroups();
  const { account } = useAccount();
  const registered = !!account?.username;
  const [preview, setPreview] = useState<{ code: string; data: InvitePreview | null; error?: string } | null>(null);
  const [choice, setChoice] = useState<string | "new" | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!groups || !registered) return;
    let alive = true;
    groups.preview(code).then(
      (data) => alive && setPreview({ code, data }),
      (e) => alive && setPreview({ code, data: null, error: messageOf(e) }),
    );
    return () => {
      alive = false;
    };
  }, [groups, registered, code]);

  // già dentro: si va direttamente alla compagnia
  useEffect(() => {
    if (preview?.data?.alreadyMember) router.replace(`/compagnie/${preview.data.id}`);
  }, [preview, router]);

  async function join() {
    if (!groups || !choice) return;
    setBusy(true);
    setError(null);
    try {
      const id = await groups.join(code, choice === "new" ? { newName } : { memberId: choice });
      router.push(`/compagnie/${id}`);
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
      // la lista dei nomi liberi potrebbe essere cambiata
      groups.preview(code).then((data) => setPreview({ code, data }), () => {});
    }
  }

  const data = preview?.code === code ? preview.data : undefined;

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-400">♠ Invito a una compagnia</p>

      {!groups ? (
        <p className="mt-6 text-white/60">Le compagnie funzionano solo con il backend online.</p>
      ) : account === undefined ? (
        <p className="mt-6 text-white/45">Caricamento…</p>
      ) : !registered ? (
        <div className="mt-6">
          <AccountRequired next={`/c/${code}`} text="Per entrare nella compagnia serve un account. Bastano username e password: poi torni qui." />
        </div>
      ) : data === undefined ? (
        <p className="mt-6 text-white/45">Cerco la compagnia {code}…</p>
      ) : data === null ? (
        <div className="mt-6 space-y-4">
          <h1 className="text-2xl font-black">Codice non valido</h1>
          <p className="text-white/60">{preview?.error ?? `Nessuna compagnia con il codice ${code}. Forse è stato cambiato: chiedine uno nuovo.`}</p>
          <Link href="/compagnie" className="inline-block text-blue-300 underline">
            Le tue compagnie
          </Link>
        </div>
      ) : (
        <>
          <h1 className="mt-1 text-3xl font-black">{data.name}</h1>
          <p className="mt-1 text-sm text-white/50">
            {data.memberCount} {data.memberCount === 1 ? "membro" : "membri"}
          </p>

          <h2 className="mt-7 text-lg font-bold">Chi sei?</h2>
          {data.unclaimed.length > 0 ? (
            <p className="mb-3 text-sm text-white/50">Se hai già giocato con loro, scegli il tuo nome: ritroverai le tue partite.</p>
          ) : (
            <p className="mb-3 text-sm text-white/50">Entra con il nome con cui ti conoscono.</p>
          )}

          <ul className="space-y-2" role="radiogroup" aria-label="Chi sei?">
            {data.unclaimed.map((m) => (
              <li key={m.id}>
                <ChoiceButton selected={choice === m.id} onClick={() => setChoice(m.id)} label={`Sono ${m.name}`}>
                  <MemberFace name={m.name} character={m.character} />
                  <span className="flex-1 font-semibold">Sono {m.name}</span>
                </ChoiceButton>
              </li>
            ))}
            <li>
              <ChoiceButton selected={choice === "new"} onClick={() => setChoice("new")} label="Sono nuovo">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-night-600 text-white/70">
                  <UserPlus size={18} />
                </span>
                <span className="flex-1 font-semibold">{data.unclaimed.length > 0 ? "Non sono nessuno di questi" : "Entro come nuovo"}</span>
              </ChoiceButton>
            </li>
          </ul>

          {choice === "new" && (
            <div className="mt-4">
              <label className="block text-sm text-white/60" htmlFor="new-name">
                Il tuo nome nella compagnia
              </label>
              <input
                id="new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={20}
                placeholder={account?.displayName ?? ""}
                className={inputClass}
              />
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
              {error}
            </p>
          )}

          <Button className="mt-6 w-full" disabled={busy || !choice || (choice === "new" && !newName.trim())} onClick={join}>
            {busy ? "Un attimo…" : "Entra nella compagnia"}
          </Button>
        </>
      )}
    </main>
  );
}

function ChoiceButton({ selected, onClick, label, children }: { selected: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition ${
        selected ? "bg-blue-600/20 ring-blue-400" : "bg-night-800 ring-white/5 hover:bg-night-700"
      }`}
    >
      {children}
      {selected && <Check size={20} className="text-blue-300" />}
    </button>
  );
}
