import React from "react";
import { DashboardChrome } from "@/components/DashboardChrome";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DashboardChrome>{children}</DashboardChrome>;
}
