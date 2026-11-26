"use client";

import { formatBytes, titleCase } from "@/lib/format";
import { Badge, Card, Empty, Score, scoreTone } from "./ui";

const SEVERITY_TONES = { high: "bad", medium: "warn", low: "neutral" };

function Check({ ok, label }) {
  return <Badge tone={ok ? "good" : "bad"}>{`${label}: ${ok ? "yes" : "no"}`}</Badge>;
}

export default function ReportView({ report }) {
  const { overallScore, categoryScores, issues, site, pages, brokenLinks } = report;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-5">
          <Score value={overallScore} size="lg" />
          <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(categoryScores).map(([category, value]) => (
              <div key={category}>
                <dt className="text-xs text-zinc-500">{titleCase(category)}</dt>
                <dd className="mt-1">
                  <Badge tone={scoreTone(value)}>{value} / 100</Badge>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Check ok={site.https} label="HTTPS" />
          <Check ok={site.robotsTxt} label="robots.txt" />
          <Check ok={site.sitemap} label="Sitemap" />
        </div>
      </Card>

      <section aria-label="Issues">
        <h3 className="mb-2 font-semibold">Issues ({issues.length})</h3>
        {issues.length === 0 ? (
          <Empty title="No issues found" />
        ) : (
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li key={issue.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONES[issue.severity]}>{titleCase(issue.severity)}</Badge>
                    <Badge>{titleCase(issue.category)}</Badge>
                    <p className="font-medium">{issue.message}</p>
                  </div>
                  <p className="mt-2 text-sm">{issue.recommendation}</p>
                  <ul className="mt-2 text-xs break-all text-zinc-500">
                    {issue.affected.map((url) => (
                      <li key={url}>{url}</li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <summary className="cursor-pointer font-semibold">Pages checked ({pages.length})</summary>
        <ul className="mt-3 space-y-3">
          {pages.map((page) => (
            <li key={page.url} className="text-sm">
              <p className="font-medium break-all">{page.url}</p>
              <p>{page.title || "No title"}</p>
              <p className="text-zinc-500">
                Status {page.status} · {page.responseTimeMs} ms · {formatBytes(page.bytes)} ·{" "}
                {page.wordCount} words · {page.h1Count} H1 · {page.imagesMissingAlt} of{" "}
                {page.imageCount} images without alt
              </p>
            </li>
          ))}
        </ul>
      </details>

      {brokenLinks.length > 0 && (
        <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <summary className="cursor-pointer font-semibold">
            Broken links ({brokenLinks.length})
          </summary>
          <ul className="mt-3 text-sm break-all">
            {brokenLinks.map((link) => (
              <li key={link.url}>
                {link.url} ({link.status ?? "no response"})
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
