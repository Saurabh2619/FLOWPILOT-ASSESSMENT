"use client";

import Link from "next/link";
import { Suspense } from "react";
import RedirectSignedIn from "@/components/RedirectSignedIn";
import { Card, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function AuthLayout({ children }) {
  const { status } = useAuth();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <Link href="/" className="text-center text-2xl font-semibold tracking-tight">
        FlowPilot
      </Link>
      <Card>{status === "loading" ? <Loading rows={2} /> : children}</Card>
      <Suspense fallback={null}>
        <RedirectSignedIn />
      </Suspense>
    </main>
  );
}
