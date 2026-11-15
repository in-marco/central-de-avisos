import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DemoBanner } from "./_components/demo-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Central de avisos",
  description:
    "Central de avisos para empresas de servicios con técnicos de campo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
