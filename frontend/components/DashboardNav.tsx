"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBackendStatus } from "@/lib/useBackendStatus";

const links = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/profile", label: "Academic Profile" },
  { href: "/dashboard/upload", label: "Upload Workspace" },
  { href: "/dashboard/recommendations", label: "Recommendations" },
  { href: "/dashboard/careers", label: "Career Match" },
  { href: "/dashboard/study", label: "Study Workspace" },
  { href: "/dashboard/french-demo", label: "French Demo" },
];

const statusLabel: Record<string, string> = {
  ok: "API online",
  down: "API offline",
  checking: "API…",
};

export function DashboardNav() {
  const pathname = usePathname();
  const backendStatus = useBackendStatus();

  return (
    <nav className="nav-grid" aria-label="Dashboard navigation">
      {links.map((link) => {
        const isActive =
          link.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === link.href || pathname.startsWith(link.href + "/");
        return (
          <Link
            className={`nav-pill${isActive ? " active" : ""}`}
            key={link.href}
            href={link.href}
            aria-current={isActive ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
      <span
        className={`backend-status backend-status--${backendStatus}`}
        title={`Backend server: ${backendStatus}`}
        aria-label={`Backend server status: ${backendStatus}`}
      >
        <span className="backend-status-dot" />
        {statusLabel[backendStatus]}
      </span>
    </nav>
  );
}
