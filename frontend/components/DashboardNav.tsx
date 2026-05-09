import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/profile", label: "Academic Profile" },
  { href: "/dashboard/upload", label: "Upload Workspace" },
  { href: "/dashboard/recommendations", label: "Recommendations" },
  { href: "/dashboard/careers", label: "Career Match" },
  { href: "/dashboard/study", label: "Study Workspace" },
  { href: "/dashboard/french-demo", label: "French Demo" },
];

export function DashboardNav() {
  return (
    <nav className="nav-grid" aria-label="Dashboard navigation">
      {links.map((link) => (
        <Link className="nav-pill" key={link.href} href={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
