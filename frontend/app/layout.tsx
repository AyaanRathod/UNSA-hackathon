import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import Link from "next/link";
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
        <header className="site-header">
          <div className="site-header-inner">
            <Link className="brand" href="/">
              Pathwise AI
            </Link>
            <p className="header-note">Pathway planning and grounded study tools.</p>
          </div>
        </header>
        <main>{children}</main>
        <ConditionalFooter />
      </body>
    </html>
  );
}
