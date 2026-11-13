"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** Pannello che sale dal basso (su desktop resta centrato). */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Chiudi" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-night-800 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-white/10 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-white/60 hover:bg-white/10" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
}) {
  const styles = {
    primary: "bg-gold-400 hover:bg-gold-500 text-night-950",
    secondary: "bg-night-600 hover:bg-night-700 text-white",
    danger: "bg-red-600 hover:bg-red-500 text-white",
    success: "bg-felt-600 hover:bg-felt-500 text-white",
    ghost: "bg-transparent hover:bg-white/10 text-white/80",
  }[variant];
  return (
    <button
      {...props}
      className={`rounded-2xl px-4 py-3.5 font-bold tracking-wide transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100 ${styles} ${className}`}
    />
  );
}
