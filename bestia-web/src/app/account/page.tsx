"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, KeyRound, LogOut, Pencil, Trash2, UserRound } from "lucide-react";
import { AccountError, MIN_PASSWORD, passwordProblem, usernameProblem, type Account, type AccountService } from "@/lib/account";
import { restartApp, useAccount } from "@/lib/useAccount";
import { isEmpty } from "@/lib/avatar/catalog";
import { getCharacter, saveCharacter } from "@/lib/avatar/store";
import { Button, Sheet } from "@/components/Sheet";
import { Character, CROPS } from "@/components/Character";
import { CharacterEditor } from "@/components/CharacterEditor";
import { ConfirmDialog, Toast, type ConfirmRequest, type ToastMessage } from "@/components/ui";
import { Disclaimer } from "@/components/Disclaimer";

const inputClass =
  "mt-1 w-full rounded-xl bg-night-900 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-blue-500 aria-[invalid=true]:ring-red-400";

const messageOf = (e: unknown) => (e instanceof AccountError || e instanceof Error ? e.message : "Qualcosa è andato storto.");

export default function AccountPage() {
  const { account, reload, accounts } = useAccount();

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/" className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/10">
        <ChevronLeft size={18} /> Partite
      </Link>
      <h1 className="mb-6 text-3xl font-black">Il tuo account</h1>

      {!accounts ? (
        <p className="text-white/60">Gli account funzionano solo con il backend online (Supabase). Ora le partite sono salvate su questo dispositivo.</p>
      ) : account === undefined ? (
        <p className="text-white/45">Caricamento…</p>
      ) : account === null ? (
        <div className="space-y-3">
          <p className="text-white/60">Non riesco a collegarmi. Controlla la connessione e riprova.</p>
          <Button variant="secondary" onClick={() => void reload()}>
            Riprova
          </Button>
        </div>
      ) : account.username ? (
        <Profile account={account} accounts={accounts} onChanged={reload} />
      ) : (
        <SignIn accounts={accounts} />
      )}

      <Disclaimer className="mt-10" />
    </main>
  );
}

/** Dove tornare dopo l'accesso (?next=/c/ABC234), solo percorsi interni all'app. */
function nextPath(): string | null {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/** Ospite anonimo: entra con un account o ne crea uno. */
function SignIn({ accounts }: { accounts: AccountService }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const registering = mode === "register";
  const userProblem = registering && touched ? usernameProblem(username) : null;
  const passProblem = registering && touched ? passwordProblem(password) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (registering && (usernameProblem(username) || passwordProblem(password))) return;
    setBusy(true);
    setError(null);
    try {
      if (registering) await accounts.register(username, password);
      else await accounts.login(username, password);
      restartApp(nextPath() ?? "/account");
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  function switchTo(next: "login" | "register") {
    setMode(next);
    setError(null);
    setTouched(false);
  }

  return (
    <>
      <div role="tablist" aria-label="Accesso" className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-night-800 p-1 ring-1 ring-white/5">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchTo(m)}
            className={`rounded-xl py-2.5 text-sm font-bold transition ${mode === m ? "bg-night-600 text-white" : "text-white/50 hover:text-white/80"}`}
          >
            {m === "login" ? "Entra" : "Crea account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} noValidate>
        <label className="block text-sm text-white/60" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          aria-invalid={!!userProblem}
          aria-describedby="username-hint"
          className={inputClass}
        />
        <p id="username-hint" className={`mt-1 text-xs ${userProblem ? "text-red-300" : "text-white/40"}`}>
          {userProblem ?? (registering ? "3–20 caratteri: lettere, numeri, punto e trattino basso." : " ")}
        </p>

        <label className="mt-3 block text-sm text-white/60" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={registering ? "new-password" : "current-password"}
          aria-invalid={!!passProblem}
          aria-describedby="password-hint"
          className={inputClass}
        />
        <p id="password-hint" className={`mt-1 text-xs ${passProblem ? "text-red-300" : "text-white/40"}`}>
          {passProblem ?? (registering ? `Almeno ${MIN_PASSWORD} caratteri. Fatti aiutare dal portachiavi del telefono a ricordarla.` : " ")}
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
            {error}
          </p>
        )}

        <Button type="submit" className="mt-5 w-full" disabled={busy}>
          {busy ? "Un attimo…" : registering ? "Crea account" : "Entra"}
        </Button>
      </form>

      <div className="mt-6 space-y-2 text-xs leading-relaxed text-white/40">
        {registering ? (
          <p>
            Niente email: bastano username e password. Le partite che hai già fatto da questo telefono restano tue. Se dimentichi la
            password, finché resti collegato qui la cambi dal profilo; altrimenti chiedi a chi gestisce l&apos;app.
          </p>
        ) : (
          <p>Entrando, le partite fatte su questo telefono senza account non saranno più tue: crea l&apos;account se vuoi tenerle.</p>
        )}
      </div>
    </>
  );
}

/** Utente registrato: nome, personaggio, password, uscita ed eliminazione. */
function Profile({ account, accounts, onChanged }: { account: Account; accounts: AccountService; onChanged: () => Promise<void> }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const name = account.displayName || account.username || "";
  const show = (text: string, kind: ToastMessage["kind"]) => setToast({ text, kind, id: Date.now() });

  function openCharacter() {
    // l'editor lavora sui personaggi del dispositivo: parte da quello del profilo
    if (account.character && !isEmpty(account.character)) saveCharacter(name, account.character);
    setEditingCharacter(true);
  }

  return (
    <>
      <section className="flex items-center gap-4 rounded-3xl bg-night-800 p-4 ring-1 ring-white/5">
        <button
          onClick={openCharacter}
          className="relative w-20 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-night-600 to-night-900 ring-1 ring-white/10"
          aria-label="Modifica il tuo personaggio"
        >
          {account.character && !isEmpty(account.character) ? (
            <Character config={account.character} crop={CROPS.bust} label={`Personaggio di ${name}`} />
          ) : (
            <span className="flex aspect-square items-center justify-center text-white/40">
              <UserRound size={36} />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold">{name}</p>
          <p className="truncate text-sm text-white/45">@{account.username}</p>
        </div>
      </section>

      <ul className="mt-5 divide-y divide-white/5 overflow-hidden rounded-2xl bg-night-800 ring-1 ring-white/5">
        <Row icon={<Pencil size={18} />} label="Nome al tavolo" detail={name} onClick={() => setEditingName(true)} />
        <Row icon={<UserRound size={18} />} label="Personaggio" onClick={openCharacter} />
        <Row icon={<KeyRound size={18} />} label="Cambia password" onClick={() => setChangingPassword(true)} />
        <Row
          icon={<LogOut size={18} />}
          label="Esci"
          onClick={() =>
            setConfirm({
              title: "Uscire dall'account?",
              message: "Per rientrare su questo telefono ti serviranno username e password.",
              confirmLabel: "Esci",
              onConfirm: async () => {
                await accounts.logout();
                restartApp("/account");
              },
            })
          }
        />
      </ul>

      <button
        onClick={() =>
          setConfirm({
            title: "Eliminare l'account?",
            message: (
              <>
                Spariscono username, password, nome e personaggio. Le partite che hai condotto da master restano a chi ci ha giocato.{" "}
                <strong className="text-white">Non si può annullare.</strong>
              </>
            ),
            confirmLabel: "Elimina account",
            danger: true,
            onConfirm: async () => {
              try {
                await accounts.deleteAccount();
                restartApp("/");
              } catch (e) {
                show(messageOf(e), "error");
              }
            },
          })
        }
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-red-300/80 hover:bg-red-500/10"
      >
        <Trash2 size={16} /> Elimina account
      </button>

      {editingName && (
        <NameSheet
          initial={name}
          onClose={() => setEditingName(false)}
          onSave={async (v) => {
            await accounts.setDisplayName(v);
            await onChanged();
            show("Nome salvato", "success");
          }}
        />
      )}
      {changingPassword && (
        <PasswordSheet
          onClose={() => setChangingPassword(false)}
          onSave={async (v) => {
            await accounts.changePassword(v);
            show("Password cambiata", "success");
          }}
        />
      )}
      {editingCharacter && (
        <CharacterEditor
          name={name}
          onClose={() => setEditingCharacter(false)}
          onSaved={() =>
            void accounts.setCharacter(getCharacter(name)).then(
              () => onChanged(),
              (e) => show(messageOf(e), "error"),
            )
          }
        />
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </>
  );
}

function Row({ icon, label, detail, onClick }: { icon: React.ReactNode; label: string; detail?: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5">
        <span className="text-white/50">{icon}</span>
        <span className="flex-1 font-semibold">{label}</span>
        {detail && <span className="max-w-[45%] truncate text-sm text-white/45">{detail}</span>}
      </button>
    </li>
  );
}

function NameSheet({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (v: string) => Promise<void> }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open onClose={onClose} title="Nome al tavolo">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onSave(value);
            onClose();
          } catch (err) {
            setError(messageOf(err));
          }
        }}
      >
        <label className="block text-sm text-white/60" htmlFor="display-name">
          Come ti chiamano gli altri
        </label>
        <input id="display-name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={20} className={inputClass} />
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        <Button type="submit" className="mt-5 w-full" disabled={!value.trim()}>
          Salva
        </Button>
      </form>
    </Sheet>
  );
}

function PasswordSheet({ onClose, onSave }: { onClose: () => void; onSave: (v: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open onClose={onClose} title="Cambia password">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const problem = passwordProblem(value);
          if (problem) return setError(problem);
          setBusy(true);
          try {
            await onSave(value);
            onClose();
          } catch (err) {
            setError(messageOf(err));
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm text-white/60" htmlFor="new-password">
          Nuova password
        </label>
        <input
          id="new-password"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-white/40">Non serve quella vecchia: questo telefono è già collegato al tuo account.</p>
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        <Button type="submit" className="mt-5 w-full" disabled={busy}>
          Cambia password
        </Button>
      </form>
    </Sheet>
  );
}
