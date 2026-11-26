"use client";

import Link from "next/link";
import { Alert, Button, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSubmit } from "@/lib/use-submit";

export default function SignupPage() {
  const { login } = useAuth();
  const { submit, pending, error } = useSubmit(async (values) => {
    await api("/auth/signup", { method: "POST", body: values });
    await login(values);
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-lg font-semibold">Create your account</h1>
      <Alert>{error}</Alert>
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        hint="At least 8 characters."
        required
      />
      <Button type="submit" pending={pending} className="w-full">
        Sign up
      </Button>
      <p className="text-sm">
        Already registered?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
