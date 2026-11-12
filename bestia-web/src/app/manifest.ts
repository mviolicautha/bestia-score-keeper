import type { MetadataRoute } from "next";

/** Rende l'app installabile (schermata Home su iPhone/Android, app su desktop). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bestia",
    short_name: "Bestia",
    description: "Segnapunti per la Bestia: piatto, vincite, bestie e conti di fine serata.",
    lang: "it",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#121826",
    theme_color: "#121826",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
