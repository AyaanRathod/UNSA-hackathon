import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import { ConditionalFooter } from "@/components/ConditionalFooter";

export const metadata: Metadata = {
  title: "Pathwise AI",
  description: "Pathway planning and study workspace for Brock coursework",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ConditionalFooter />
      </body>
    </html>
  );
}
