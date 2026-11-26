"use client";

import Link from "next/link";
import { useId } from "react";

const join = (...classes) => classes.filter(Boolean).join(" ");

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-60";

const BUTTON_STYLES = {
  primary: "bg-teal-700 text-white hover:bg-teal-800",
  secondary:
    "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
  danger:
    "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950",
};

export function Button({ variant = "primary", pending = false, children, className, ...props }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || pending}
      className={join(BUTTON_BASE, BUTTON_STYLES[variant], className)}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", className, ...props }) {
  return <Link {...props} className={join(BUTTON_BASE, BUTTON_STYLES[variant], className)} />;
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

const CONTROL =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-zinc-700";

export function Field({ label, hint, className, ...props }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input id={id} {...props} className={CONTROL} />
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function Select({ label, hideLabel = false, className, children, ...props }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "mb-1 block text-sm font-medium"}>
        {label}
      </label>
      <select id={id} {...props} className={join(CONTROL, "dark:bg-zinc-950")}>
        {children}
      </select>
    </div>
  );
}

export function Card({ className, ...props }) {
  return (
    <div
      {...props}
      className={join("rounded-xl border border-zinc-200 p-4 sm:p-5 dark:border-zinc-800", className)}
    />
  );
}

const TONES = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function Badge({ tone = "neutral", children }) {
  return (
    <span className={join("inline-block rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone])}>
      {children}
    </span>
  );
}

export const scoreTone = (score) => (score >= 80 ? "good" : score >= 50 ? "warn" : "bad");

export function Score({ value, size = "md" }) {
  const known = typeof value === "number";
  return (
    <span
      className={join(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums",
        size === "lg" ? "size-20 text-3xl" : "size-12 text-lg",
        TONES[known ? scoreTone(value) : "neutral"],
      )}
      aria-label={known ? `Score ${value} out of 100` : "No score yet"}
    >
      {known ? value : "–"}
    </span>
  );
}

export function Alert({ tone = "bad", children, onRetry }) {
  if (!children) return null;
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={join("flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-sm", TONES[tone])}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Loading({ label = "Loading", rows = 3 }) {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
      ))}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center dark:border-zinc-700">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-zinc-500">{children}</div>}
    </div>
  );
}

export function PageTitle({ title, children }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
      {children && <div className="mt-1 text-sm text-zinc-500">{children}</div>}
    </div>
  );
}
