"use client";

import { useState } from "react";

export function useSubmit(action) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event?.preventDefault();
    const values = event?.currentTarget?.elements
      ? Object.fromEntries(new FormData(event.currentTarget))
      : undefined;
    setPending(true);
    setError(null);
    try {
      await action(values);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  };

  return { submit, pending, error };
}
