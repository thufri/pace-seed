import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PACE-SEED — Urban Digital Twin Platform",
  description:
    "Platform for Advanced City Environments — Spatial Ecosystem for Environmental Data. Connect 3D city models with live sustainability data, scenario simulation, and extreme weather visualization.",
  keywords: ["urban planning", "digital twin", "sustainability", "3D", "GIS"],
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}