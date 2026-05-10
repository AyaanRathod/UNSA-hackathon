"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard Home" },
  { href: "/dashboard/profile", label: "Academic Profile" },
  { href: "/dashboard/upload", label: "Upload Materials" },
  { href: "/dashboard/audit", label: "Degree Audit" },
  { href: "/dashboard/careers", label: "Career Matches" },
  { href: "/dashboard/study", label: "Study Workspace" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="stack" style={{ gap: "0.5rem" }}>
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${isActive ? "active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
