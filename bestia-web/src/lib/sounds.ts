/**
 * Suoni della vista TV, sintetizzati al volo (nessun file da scaricare).
 * I browser li permettono solo dopo un tocco: `unlock()` va chiamata da un clic.
 */

export type SoundKind = "bestia" | "win" | "big" | "pass";

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** Da chiamare dentro un clic: sblocca l'audio. true se ora i suoni possono partire. */
export async function unlock(): Promise<boolean> {
  const c = context();
  if (!c) return false;
  try {
    if (c.state === "suspended") await c.resume();
  } catch {
    return false;
  }
  return c.state === "running";
}

/** true se l'audio è già sbloccato (es. dopo un tocco precedente nella stessa pagina). */
export const isUnlocked = () => ctx?.state === "running";

/** Una nota: frequenza (anche in glissando), forma d'onda, inizio e durata in secondi. */
function tone(
  c: AudioContext,
  out: AudioNode,
  { from, to = from, type = "sine", at = 0, dur = 0.2, gain = 0.25 }: { from: number; to?: number; type?: OscillatorType; at?: number; dur?: number; gain?: number },
) {
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export function play(kind: SoundKind) {
  const c = context();
  if (!c || c.state !== "running") return;
  const master = c.createGain();
  master.gain.value = 0.8;
  master.connect(c.destination);

  if (kind === "bestia") {
    // "wah wah" che scende, con un tonfo: la bestia!
    const low = c.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 900;
    low.connect(master);
    tone(c, low, { from: 330, to: 300, type: "sawtooth", at: 0, dur: 0.32, gain: 0.3 });
    tone(c, low, { from: 280, to: 250, type: "sawtooth", at: 0.36, dur: 0.32, gain: 0.3 });
    tone(c, low, { from: 230, to: 110, type: "sawtooth", at: 0.72, dur: 0.75, gain: 0.32 });
    tone(c, master, { from: 120, to: 40, type: "sine", at: 0.72, dur: 0.35, gain: 0.5 });
  } else if (kind === "win") {
    // monete: arpeggio veloce
    [988, 1319, 1568].forEach((f, i) => tone(c, master, { from: f, type: "square", at: i * 0.08, dur: 0.18, gain: 0.08 }));
  } else if (kind === "big") {
    // piatto d'oro: arpeggio lungo e scintillio
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(c, master, { from: f, type: "triangle", at: i * 0.07, dur: 0.35, gain: 0.16 }));
    [2637, 3136, 2637, 3520].forEach((f, i) => tone(c, master, { from: f, type: "sine", at: 0.55 + i * 0.09, dur: 0.25, gain: 0.06 }));
  } else {
    // mano passata: un colpetto discreto
    tone(c, master, { from: 700, to: 500, type: "sine", dur: 0.12, gain: 0.12 });
  }
}
