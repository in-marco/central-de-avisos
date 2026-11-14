import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
  async headers() {
    return [
      {
        // El token de invitación viaja en el path del enlace: no debe filtrarse
        // a terceros por Referer, quedar en cachés ni indexarse.
        //
        // `same-origin` y no `no-referrer`: con `no-referrer` el navegador
        // envía `Origin: null` en el POST del formulario y el control de mismo
        // origen de /api/invitaciones/aceptar lo rechaza con 403.
        source: "/invitacion/:path*",
        headers: [
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
