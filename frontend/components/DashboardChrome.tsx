"use client";

import type { ReactNode } from "react";
import { DashboardNav } from "@/components/DashboardNav";

/** Disclaimer lives on the marketing home page only — dashboard stays focused on tasks. */
export function DashboardChrome({ children }: { children: ReactNode }) {
  return (
    <div className="container dashboard-app-shell stack">
      <DashboardNav />
      {children}
    </div>
  );
}
