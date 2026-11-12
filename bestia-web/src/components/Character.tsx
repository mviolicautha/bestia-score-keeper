/* eslint-disable @next/next/no-img-element -- livelli PNG/WebP sovrapposti: next/image non serve e complica le maschere */
import { layersFor, type CharacterConfig } from "@/lib/avatar/catalog";

/** Riquadro visibile del personaggio (0..1 sull'immagine quadrata completa: x0, y0, x1, y1). */
export type Crop = [number, number, number, number];

export const CROPS = {
  full: [0, 0, 1, 1],
  /** Mezzo busto, con spazio sopra per i cappelli. */
  bust: [0.1, 0.06, 0.9, 0.86],
  /** Testa (con cappello), per le icone tonde. */
  head: [0.27, 0.19, 0.73, 0.65],
} satisfies Record<string, Crop>;

/** Riquadro quadrato attorno a una parte dell'immagine, con un po' di margine (per le miniature). */
export function cropAround([x0, y0, x1, y1]: Crop, pad = 1.3, min = 0.34): Crop {
  const side = Math.min(1, Math.max(min, Math.max(x1 - x0, y1 - y0) * pad));
  const cx = Math.min(1 - side / 2, Math.max(side / 2, (x0 + x1) / 2));
  const cy = Math.min(1 - side / 2, Math.max(side / 2, (y0 + y1) / 2));
  return [cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2];
}

/**
 * Disegna il personaggio sovrapponendo i livelli. Riempie il contenitore (quadrato):
 * la dimensione si decide dall'esterno con le classi.
 */
export function Character({
  config,
  crop = CROPS.bust,
  className = "",
  label,
}: {
  config: CharacterConfig | null | undefined;
  crop?: Crop;
  className?: string;
  /** Testo per lettori di schermo; senza, l'immagine è decorativa. */
  label?: string;
}) {
  const [x0, y0, x1] = crop;
  const side = x1 - x0;
  const inner: React.CSSProperties = {
    position: "absolute",
    width: `${100 / side}%`,
    height: `${100 / side}%`,
    left: `${(-x0 / side) * 100}%`,
    top: `${(-y0 / side) * 100}%`,
  };
  return (
    <span
      className={`relative block aspect-square overflow-hidden ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span style={inner}>
        {layersFor(config).map((l) => (
          <img
            key={l.key}
            src={l.src}
            alt=""
            draggable={false}
            decoding="async"
            data-layer={l.key}
            className="absolute inset-0 h-full w-full select-none"
            style={
              l.mask
                ? {
                    maskImage: `url(${l.mask})`,
                    WebkitMaskImage: `url(${l.mask})`,
                    maskSize: "100% 100%",
                    WebkitMaskSize: "100% 100%",
                  }
                : undefined
            }
          />
        ))}
      </span>
    </span>
  );
}
