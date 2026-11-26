"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Button, Field, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

function ResetForm() {
  const token = useSearchParams().get("token");
  const [done, setDone] = useState(false);
  const { submit, pending, error } = useSubmit(async ({ password }) => {
    await api("/auth/reset-password", { method: "POST", body: { token, password } });
    setDone(true);
  });

  if (!token) {
    return <Alert>This reset link is incomplete. Request a new one.</Alert>;
  }
  if (done) {
    return <Alert tone="good">Password changed. You can log in with it now.</Alert>;
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert>{error}</Alert>
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        hint="At least 8 characters."
        required
      />
      <Button type="submit" pending={pending} className="w-full">
        Change password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <Suspense fallback={<Loading rows={1} />}>
        <ResetForm />
      </Suspense>
      <p className="text-sm">
        <Link href="/login" className="underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
