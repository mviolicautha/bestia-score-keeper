import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Il badge di sviluppo copriva i comandi in basso a sinistra.
  devIndicators: false,
  // Permette di provare il server di sviluppo dal telefono sulla stessa rete Wi-Fi.
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
