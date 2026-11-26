"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  Empty,
  Field,
  Loading,
  PageTitle,
  Score,
  Select,
} from "@/components/ui";
import WebsiteControls from "@/components/WebsiteControls";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isPending, SCHEDULES, STATUS_LABELS } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const awaitingAudit = (site) =>
  isPending(site.latestStatus) || (site.active && !site.latestStatus);

function AddWebsite({ limits, count, onAdd }) {
  const [url, setUrl] = useState("");
  const [schedule, setSchedule] = useState("daily");
  const [error, setError] = useState(null);
  const full = limits.maxWebsites !== null && count >= limits.maxWebsites;

  const submit = async (event) => {
    event.preventDefault();
    const value = url.trim();
    const address = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    setError(null);
    setUrl("");
    try {
      await onAdd({ url: address, schedule });
    } catch (failure) {
      setUrl(value);
      setError(failure.message);
    }
  };

  if (full) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          The {limits.name} plan allows {limits.maxWebsites} website(s) and you have reached that.
        </p>
        <ButtonLink href="/billing">See plans</ButtonLink>
      </Card>
    );
  }
  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          label="Website address"
          placeholder="example.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="flex-1"
          inputMode="url"
          maxLength={2000}
          required
        />
        <Select
          label="Audit schedule"
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
          className="sm:w-48"
        >
          {SCHEDULES.map((option) => (
            <option
              key={option.id}
              value={option.id}
              disabled={option.minutes < limits.minIntervalMinutes}
            >
              {option.label}
            </option>
          ))}
        </Select>
        <Button type="submit">Add website</Button>
      </form>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ site }) {
  if (!site.active) {
    return (
      <Badge tone="warn">
        {site.pausedReason === "plan_limit" ? "Paused by plan limit" : "Paused"}
      </Badge>
    );
  }
  if (!site.latestStatus) return <Badge>First audit queued</Badge>;
  const tone = { success: "good", failed: "bad" }[site.latestStatus] ?? "neutral";
  return <Badge tone={tone}>{STATUS_LABELS[site.latestStatus]}</Badge>;
}

export default function WebsitesPage() {
  const { user } = useAuth();
  const sites = useResource("/websites", {
    pollWhile: (data) => data.websites.some(awaitingAudit),
  });
  const billing = useResource("/billing/subscription");
  const [adding, setAdding] = useState([]);
  const [actionError, setActionError] = useState(null);

  const change = (update) => sites.setData((data) => ({ websites: update(data.websites) }));

  const add = async (values) => {
    const draft = { ...values, key: crypto.randomUUID() };
    setAdding((list) => [...list, draft]);
    try {
      const { website } = await api("/websites", { method: "POST", body: values });
      change((list) => [...list, { ...website, latestStatus: null, latestScore: null }]);
    } finally {
      setAdding((list) => list.filter((item) => item.key !== draft.key));
    }
  };

  const update = async (site, body) => {
    const replace = (next) =>
      change((list) => list.map((item) => (item.id === site.id ? { ...item, ...next } : item)));
    setActionError(null);
    replace(body);
    try {
      const { website } = await api(`/websites/${site.id}`, { method: "PATCH", body });
      replace(website);
    } catch (error) {
      replace(site);
      setActionError(error.message);
    }
  };

  const remove = async (site) => {
    if (!window.confirm(`Delete ${site.url} and its audit history?`)) return;
    setActionError(null);
    change((list) => list.filter((item) => item.id !== site.id));
    try {
      await api(`/websites/${site.id}`, { method: "DELETE" });
    } catch (error) {
      setActionError(error.message);
      sites.reload();
    }
  };

  const loadError = sites.error ?? billing.error;
  const reload = () => {
    sites.reload();
    billing.reload();
  };
  const list = sites.data?.websites;

  return (
    <div className="space-y-4">
      <PageTitle title="Websites">Add a site and FlowPilot audits it on schedule.</PageTitle>
      <Alert onRetry={reload}>{loadError?.message}</Alert>
      <Alert>{actionError}</Alert>
      {(sites.loading || billing.loading) && <Loading label="Loading your websites" />}
      {list && billing.data && (
        <>
          <AddWebsite
            key={user.plan}
            limits={billing.data.limits}
            count={list.length + adding.length}
            onAdd={add}
          />
          {list.length === 0 && adding.length === 0 && (
            <Empty title="No websites yet">Add your first website above.</Empty>
          )}
          <ul className="space-y-3">
            {list.map((site) => (
              <li key={site.id}>
                <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Score value={site.latestScore} />
                    <div className="min-w-0">
                      <Link
                        href={`/websites/${site.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {site.url}
                      </Link>
                      <StatusBadge site={site} />
                    </div>
                  </div>
                  <WebsiteControls
                    site={site}
                    limits={billing.data.limits}
                    onUpdate={(body) => update(site, body)}
                    onDelete={() => remove(site)}
                  />
                </Card>
              </li>
            ))}
            {adding.map((draft) => (
              <li key={draft.key} aria-busy="true">
                <Card className="flex items-center gap-3 opacity-60">
                  <Score value={null} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{draft.url}</p>
                    <p className="text-sm">Checking the website…</p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
