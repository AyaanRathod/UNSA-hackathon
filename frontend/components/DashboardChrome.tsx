"use client";

import React from "react";
import Link from "next/link";
import { DashboardNav } from "./DashboardNav";

export function DashboardChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <Link href="/" className="brand" style={{ marginBottom: "2rem", textDecoration: "none" }}>
          Pathwise AI
        </Link>
        <DashboardNav />
        <div style={{ marginTop: "auto", paddingTop: "2rem" }}>
          <p className="meta" style={{ fontSize: "0.8rem" }}>
            Built for Brock University
          </p>
        </div>
      </aside>
      <main className="app-main">
        {children}
      </main>
    </div>
  );
}
