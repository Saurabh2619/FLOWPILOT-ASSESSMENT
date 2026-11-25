"use client";

import { useEffect, useState } from "react";

const LABELS = {
  loading: "Checking API…",
  ok: "API is reachable",
  error: "API is not reachable",
};

export default function ApiStatus() {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then((res) => setStatus(res.ok ? "ok" : "error"))
      .catch((error) => {
        if (error.name !== "AbortError") setStatus("error");
      });

    return () => controller.abort();
  }, []);

  return (
    <p role="status" className="text-sm text-zinc-500">
      {LABELS[status]}
    </p>
  );
}
