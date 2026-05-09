import type { ReactNode } from "react";
import { DashboardNav } from "@/components/DashboardNav";
import { Disclaimers } from "@/components/Disclaimers";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container stack">
      <DashboardNav />
      <Disclaimers />
      {children}
    </div>
  );
}
