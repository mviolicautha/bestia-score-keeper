/** Nota legale breve: Bestia è un segnapunti, non gestisce denaro né scommesse. */
export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-[11px] leading-relaxed text-white/30 ${className}`}>
      Bestia è un segnapunti per partite tra amici. Non gestisce denaro, puntate o pagamenti e non organizza gioco con
      vincite: gli importi mostrati servono solo a tenere il conto della partita.
    </p>
  );
}
