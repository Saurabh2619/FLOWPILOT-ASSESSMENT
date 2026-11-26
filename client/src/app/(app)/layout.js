"use client";

import { useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import AppHeader, { ActiveNavLinks, NavLinks } from "@/components/AppHeader";
import { Alert, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function AppLayout({ children }) {
  const { status, retry } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "guest") router.replace("/login");
  }, [status, router]);

  if (status !== "user") {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {status === "error" ? (
          <Alert onRetry={retry}>Cannot reach the server.</Alert>
        ) : (
          <Loading label="Checking your session" />
        )}
      </main>
    );
  }

  return (
    <>
      <AppHeader>
        <Suspense fallback={<NavLinks />}>
          <ActiveNavLinks />
        </Suspense>
      </AppHeader>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
