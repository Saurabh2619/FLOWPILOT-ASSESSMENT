"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export default function RedirectSignedIn() {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "user" && pathname !== "/reset-password") router.replace("/websites");
  }, [status, pathname, router]);

  return null;
}
