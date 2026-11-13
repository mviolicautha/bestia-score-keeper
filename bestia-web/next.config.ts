import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Il badge di sviluppo copriva i comandi in basso a sinistra.
  devIndicators: false,
  // Permette di provare il server di sviluppo dal telefono sulla stessa rete Wi-Fi.
  allowedDevOrigins: ["192.168.*.*"],
  // Sito privato tra amici: niente indicizzazione, anche per immagini, API e file statici.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
