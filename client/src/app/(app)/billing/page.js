"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, Loading, PageTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, SCHEDULES } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const features = (plan) => [
  plan.maxWebsites === null ? "Unlimited websites" : `${plan.maxWebsites} website(s)`,
  `Audits ${SCHEDULES.find((s) => s.minutes === plan.minIntervalMinutes).label.toLowerCase()} at most`,
  plan.aiSuggestions ? "AI suggestions" : "Audit report only",
  ...(plan.priorityJobs ? ["Priority in the job queue"] : []),
];

export default function BillingPage() {
  const { reloadUser } = useAuth();
  const plans = useResource("/billing/plans");
  const overview = useResource("/billing/subscription");
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  const run = async (key, action) => {
    setBusy(key);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error.message);
      setBusy(null);
    }
  };

  const checkout = (plan) =>
    run(plan, async () => {
      const data = await api("/billing/checkout", { method: "POST", body: { plan } });
      window.location.assign(data.checkoutUrl);
    });

  const cancel = () => {
    const warning =
      "Cancel your subscription? You move to Free now and extra websites are paused.";
    if (!window.confirm(warning)) return;
    run("cancel", async () => {
      const data = await api("/billing/cancel", { method: "POST" });
      overview.setData(() => data);
      await reloadUser();
      setBusy(null);
    });
  };

  const current = overview.data?.plan;
  const subscription = overview.data?.subscription;
  const paying = ["active", "past_due"].includes(subscription?.status);

  return (
    <div className="space-y-4">
      <PageTitle title="Billing">Test mode. No real money is charged.</PageTitle>
      <Alert
        onRetry={() => {
          plans.reload();
          overview.reload();
        }}
      >
        {(plans.error ?? overview.error)?.message}
      </Alert>
      <Alert>{actionError}</Alert>
      {(plans.loading || overview.loading) && <Loading label="Loading plans" />}
      {subscription?.status === "past_due" && (
        <Alert tone="warn">Your last renewal payment failed. Access continues for now.</Alert>
      )}
      {subscription?.status === "failed" && (
        <Alert tone="warn">Your last payment failed. You can try again.</Alert>
      )}
      {plans.data && overview.data && (
        <>
          <ul className="grid gap-4 md:grid-cols-3">
            {plans.data.plans.map((plan) => (
              <li key={plan.id}>
                <Card
                  className={`flex h-full flex-col ${plan.id === current ? "border-teal-600 dark:border-teal-600" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold">{plan.name}</h2>
                    {plan.id === current && <Badge tone="good">Current plan</Badge>}
                  </div>
                  <p className="mt-2 text-3xl font-semibold">
                    ₹{plan.priceInr}
                    <span className="text-sm font-normal text-zinc-500"> / month</span>
                  </p>
                  <ul className="mt-3 mb-4 flex-1 space-y-1 text-sm">
                    {features(plan).map((feature) => (
                      <li key={feature}>• {feature}</li>
                    ))}
                  </ul>
                  {plan.id !== current && plan.priceInr > 0 && (
                    <Button
                      onClick={() => checkout(plan.id)}
                      pending={busy === plan.id}
                      disabled={busy !== null}
                    >
                      Choose {plan.name}
                    </Button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
          {paying && (
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                Subscription renews on {formatDate(subscription.currentPeriodEnd)}.
              </p>
              <Button
                variant="danger"
                onClick={cancel}
                pending={busy === "cancel"}
                disabled={busy !== null}
              >
                Cancel subscription
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
