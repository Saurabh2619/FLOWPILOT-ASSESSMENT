"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { titleCase } from "@/lib/format";
import { useSubmit } from "@/lib/use-submit";
import { Badge, Button } from "./ui";

export function NavLinks({ pathname }) {
  const { user } = useAuth();
  const links = [
    ["/websites", "Websites"],
    ["/billing", "Billing"],
    ...(user.role === "admin" ? [["/admin", "Admin"]] : []),
  ];
  return links.map(([href, label]) => {
    const active = pathname?.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
          active ? "bg-zinc-100 dark:bg-zinc-800" : "text-zinc-500 hover:text-foreground"
        }`}
      >
        {label}
      </Link>
    );
  });
}

export function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

export default function AppHeader({ children }) {
  const { user, logout } = useAuth();
  const { submit, pending, error } = useSubmit(() => logout());

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/websites" className="font-semibold tracking-tight">
          FlowPilot
        </Link>
        <nav aria-label="Main" className="order-last flex w-full gap-1 sm:order-none sm:w-auto">
          {children}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden max-w-52 truncate text-sm text-zinc-500 md:block">
            {user.email}
          </span>
          <Badge tone={user.plan === "free" ? "neutral" : "good"}>{titleCase(user.plan)}</Badge>
          <Button variant="secondary" onClick={submit} pending={pending}>
            Log out
          </Button>
        </div>
        {error && <p className="w-full text-right text-sm text-red-600">{error}</p>}
      </div>
    </header>
  );
}
