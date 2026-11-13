"use client";

/**
 * Decorazioni del tema natalizio: un filo di lucine in cima alla pagina e neve che scende lenta.
 * Solo decorative: niente click, nascoste agli screen reader, la neve sparisce con "riduci movimento".
 */

const BULB_COLORS = ["bg-loss", "bg-gold-400", "bg-gain"] as const;
const SAGS = 3; // campate del filo
const BULBS = 13;
const SAG_DEPTH = 9; // px di abbassamento al centro di ogni campata

/** Altezza del filo (0 in alto, 1 in basso) in un punto 0..1 della larghezza. */
function sagAt(x: number): number {
  const t = (x * SAGS) % 1;
  return 4 * t * (1 - t);
}

export function FestiveLights() {
  const wire = Array.from({ length: SAGS }, (_, i) => {
    const x0 = (i * 100) / SAGS;
    const x1 = ((i + 1) * 100) / SAGS;
    return `M${x0},2 Q${(x0 + x1) / 2},${2 + SAG_DEPTH * 2} ${x1},2`;
  }).join(" ");
  return (
    <div aria-hidden className="pointer-events-none relative -mx-4 -mt-3 mb-3 h-6">
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-6 w-full">
        <path d={wire} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: BULBS }, (_, i) => {
        const x = (i + 0.5) / BULBS;
        return (
          <span
            key={i}
            className={`absolute h-2.5 w-2 -translate-x-1/2 rounded-full ${BULB_COLORS[i % BULB_COLORS.length]} animate-twinkle`}
            style={{ left: `${x * 100}%`, top: `${1 + sagAt(x) * SAG_DEPTH}px`, animationDelay: `${(i % 4) * 0.45}s` }}
          />
        );
      })}
    </div>
  );
}

const FLAKES = 22;

/** Numeri "casuali" ma stabili per fiocco, così il rendering non cambia a ogni aggiornamento. */
function rand(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

export function Snowfall() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden motion-reduce:hidden">
      {Array.from({ length: FLAKES }, (_, i) => {
        const size = 3 + rand(i, 1) * 4;
        return (
          <span
            key={i}
            className="absolute -top-4 animate-snow-fall rounded-full bg-white"
            style={{
              left: `${rand(i, 2) * 100}%`,
              width: size,
              height: size,
              opacity: 0.25 + rand(i, 3) * 0.35,
              animationDuration: `${9 + rand(i, 4) * 9}s`,
              animationDelay: `${-rand(i, 5) * 18}s`,
            }}
          />
        );
      })}
    </div>
  );
}
