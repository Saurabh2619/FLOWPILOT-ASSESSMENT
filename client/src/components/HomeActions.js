"use client";

import { useAuth } from "@/lib/auth";
import { ButtonLink } from "./ui";

export default function HomeActions() {
  const { status } = useAuth();
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      {status === "user" ? (
        <ButtonLink href="/websites">Open dashboard</ButtonLink>
      ) : (
        <>
          <ButtonLink href="/signup">Create free account</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Log in
          </ButtonLink>
        </>
      )}
    </div>
  );
}
