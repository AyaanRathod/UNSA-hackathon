import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import Link from "next/link";
import { Disclaimers } from "@/components/Disclaimers";

export const metadata: Metadata = {
  title: "Pathwise AI",
  description: "Decision-support dashboard for Brock CS pathway planning and study workflow",
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
            <p className="header-note">Decision-support dashboard for pathway planning and grounded study support.</p>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container">
            <Disclaimers compact />
          </div>
        </footer>
      </body>
    </html>
  );
}
