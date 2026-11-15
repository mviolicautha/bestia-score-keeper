import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Il badge di sviluppo copriva i comandi in basso a sinistra.
  devIndicators: false,
  // Permette di provare il server di sviluppo dal telefono sulla stessa rete Wi-Fi.
  allowedDevOrigins: ["192.168.*.*"],
  // Link corto della vista TV, da scrivere col telecomando: /KX7P2 → /t/KX7P2.
  // Le pagine vere vengono prima ("afterFiles"): qui arriva solo ciò che non esiste già.
  async rewrites() {
    return [{ source: "/:code([A-Za-z0-9]{5})", destination: "/t/:code" }];
  },
  // Sito privato tra amici: niente indicizzazione, anche per immagini, API e file statici.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
