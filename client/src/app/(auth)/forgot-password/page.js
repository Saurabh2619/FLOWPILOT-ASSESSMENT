"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState(null);
  const { submit, pending, error } = useSubmit(async (values) => {
    const data = await api("/auth/forgot-password", { method: "POST", body: values });
    setMessage(data.message);
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-lg font-semibold">Reset your password</h1>
      <Alert>{error}</Alert>
      {message && (
        <Alert tone="good">{message}. In this demo the link is written to the server log.</Alert>
      )}
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Button type="submit" pending={pending} className="w-full">
        Send reset link
      </Button>
      <p className="text-sm">
        <Link href="/login" className="underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
