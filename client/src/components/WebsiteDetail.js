"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatDate, isPending, STATUS_LABELS } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import ReportView from "./ReportView";
import Suggestions from "./Suggestions";
import { Alert, Badge, Card, Empty, Loading, PageTitle, Spinner } from "./ui";
import WebsiteControls from "./WebsiteControls";

const STATUS_TONES = { success: "good", failed: "bad" };

function RunDetail({ path, listStatus }) {
  const detail = useResource(path, {
    pollWhile: (data) => isPending(data.run.status) || isPending(data.suggestion?.status),
  });

  if (detail.error && !detail.data) {
    return <Alert onRetry={detail.reload}>{detail.error.message}</Alert>;
  }
  if (!detail.data) return <Loading label="Loading the report" />;

  const { run, report, suggestion } = detail.data;
  const status = isPending(listStatus) ? listStatus : run.status;

  if (!report) {
    if (status === "failed") {
      return <Alert>This audit failed: {run.failureReason}</Alert>;
    }
    return (
      <Card>
        <p role="status" className="flex items-center gap-2 text-sm">
          <Spinner />
          {run.failureReason
            ? `${run.failureReason}. Next try ${formatDate(run.nextAttemptAt)}.`
            : "The audit is in progress. This page updates by itself."}
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Suggestions
        suggestion={suggestion}
        path={path}
        onRequested={(next) => detail.setData((data) => ({ ...data, suggestion: next }))}
      />
      <ReportView report={report} />
    </div>
  );
}

export default function WebsiteDetail() {
  const { id } = useParams();
  const router = useRouter();
  const site = useResource(`/websites/${id}`);
  const billing = useResource("/billing/subscription");
  const history = useResource(`/websites/${id}/runs`, {
    pollWhile: (data) => data.runs.length === 0 || data.runs.some((run) => isPending(run.status)),
  });
  const [selected, setSelected] = useState(null);
  const [actionError, setActionError] = useState(null);

  const update = async (body) => {
    const previous = site.data.website;
    setActionError(null);
    site.setData(() => ({ website: { ...previous, ...body } }));
    try {
      const data = await api(`/websites/${id}`, { method: "PATCH", body });
      site.setData(() => data);
    } catch (error) {
      site.setData(() => ({ website: previous }));
      setActionError(error.message);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this website and its audit history?")) return;
    setActionError(null);
    try {
      await api(`/websites/${id}`, { method: "DELETE" });
      router.push("/websites");
    } catch (error) {
      setActionError(error.message);
    }
  };

  const loadError = site.error ?? history.error ?? billing.error;
  const reload = () => {
    site.reload();
    history.reload();
    billing.reload();
  };

  const back = (
    <Link href="/websites" className="text-sm underline">
      ← All websites
    </Link>
  );

  if (site.error?.status === 404) {
    return (
      <div className="space-y-4">
        {back}
        <Empty title="Website not found">It may have been deleted.</Empty>
      </div>
    );
  }

  const website = site.data?.website;
  const runs = history.data?.runs;
  const current =
    runs?.find((run) => run.id === selected) ??
    runs?.find((run) => run.status === "success") ??
    runs?.[0];
  const newest = runs?.[0];

  return (
    <div className="space-y-4">
      {back}
      <Alert onRetry={reload}>{loadError?.message}</Alert>
      <Alert>{actionError}</Alert>
      {(site.loading || history.loading || billing.loading) && (
        <Loading label="Loading website" />
      )}
      {website && billing.data && (
        <>
          <PageTitle title={website.url}>
            {website.active
              ? `Next audit: ${formatDate(website.nextRunAt)}`
              : "Audits are paused."}
          </PageTitle>
          <WebsiteControls
            site={website}
            limits={billing.data.limits}
            onUpdate={update}
            onDelete={remove}
          />
        </>
      )}
      {runs && runs.length === 0 && (
        <Empty title="No audits yet">
          The first audit starts within a minute. This page updates by itself.
        </Empty>
      )}
      {runs && runs.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <section aria-label="Run history" className="min-w-0">
            <h2 className="mb-2 font-semibold">History</h2>
            {newest !== current && isPending(newest.status) && (
              <p role="status" className="mb-2 flex items-center gap-2 text-sm">
                <Spinner /> A new audit is in progress.
              </p>
            )}
            <ul className="max-h-72 space-y-2 overflow-y-auto lg:max-h-[32rem]">
              {runs.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(run.id)}
                    aria-pressed={run.id === current.id}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                      run.id === current.id
                        ? "border-teal-600 bg-teal-50 dark:bg-teal-950"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <span>{formatDate(run.scheduledFor)}</span>
                    <Badge tone={STATUS_TONES[run.status]}>
                      {run.overallScore ?? STATUS_LABELS[run.status]}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Audit report" className="min-w-0">
            <h2 className="mb-2 font-semibold">Report</h2>
            <RunDetail
              key={`${current.id}-${current.status}`}
              path={`/websites/${id}/runs/${current.id}`}
              listStatus={current.status}
            />
          </section>
        </div>
      )}
    </div>
  );
}
