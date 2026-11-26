"use client";

import Link from "next/link";
import { Alert, Button, Field } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useSubmit } from "@/lib/use-submit";

export default function LoginPage() {
  const { login } = useAuth();
  const { submit, pending, error } = useSubmit(login);

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-lg font-semibold">Log in</h1>
      <Alert>{error}</Alert>
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Button type="submit" pending={pending} className="w-full">
        Log in
      </Button>
      <div className="flex justify-between gap-3 text-sm">
        <Link href="/signup" className="underline">
          Create account
        </Link>
        <Link href="/forgot-password" className="underline">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
