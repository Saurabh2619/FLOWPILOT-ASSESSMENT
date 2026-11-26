"use client";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isPending, titleCase } from "@/lib/format";
import { useSubmit } from "@/lib/use-submit";
import { Alert, Badge, Button, ButtonLink, Card, Spinner } from "./ui";

const PRIORITY_TONES = { high: "bad", medium: "warn", low: "neutral" };

export default function Suggestions({ suggestion, path, onRequested }) {
  const { user } = useAuth();
  const allowed = user.plan !== "free";
  const { submit, pending, error } = useSubmit(async () => {
    const data = await api(`${path}/suggestion`, { method: "POST" });
    onRequested(data.suggestion);
  });

  const request = (label) => (
    <Button onClick={() => submit()} pending={pending}>
      {label}
    </Button>
  );

  let body;
  if (suggestion?.status === "success") {
    body = (
      <>
        <p className="text-sm">{suggestion.summary}</p>
        <ol className="mt-3 space-y-3">
          {suggestion.items.map((item, index) => (
            <li key={index} className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={PRIORITY_TONES[item.priority]}>{titleCase(item.priority)}</Badge>
                <Badge>{titleCase(item.category)}</Badge>
                <p className="font-medium">{item.title}</p>
              </div>
              <p className="mt-1 text-sm">{item.action}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          Written by AI ({suggestion.model}). Check advice before acting on it.
        </p>
      </>
    );
  } else if (isPending(suggestion?.status)) {
    body = (
      <p role="status" className="flex items-center gap-2 text-sm">
        <Spinner />
        {suggestion.failureReason
          ? `${suggestion.failureReason}. Trying again automatically.`
          : "Preparing suggestions. This can take a minute or two."}
      </p>
    );
  } else if (!allowed) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">AI suggestions are part of the Pro and Business plans.</p>
        <ButtonLink href="/billing">Upgrade</ButtonLink>
      </div>
    );
  } else if (suggestion?.status === "failed") {
    body = (
      <div className="space-y-3">
        <Alert>{suggestion.failureReason}</Alert>
        {request("Try again")}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">No suggestions for this report yet.</p>
        {request("Generate suggestions")}
      </div>
    );
  }

  return (
    <Card>
      <h3 className="mb-3 font-semibold">AI suggestions</h3>
      {body}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}
