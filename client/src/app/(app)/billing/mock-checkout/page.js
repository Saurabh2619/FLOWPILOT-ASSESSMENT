"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Button, ButtonLink, Card, Loading, PageTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { titleCase } from "@/lib/format";

function Checkout() {
  const subscriptionId = useSearchParams().get("subscription");
  const { reloadUser } = useAuth();
  const [state, setState] = useState({ pending: null, result: null, error: null });

  const complete = async (outcome) => {
    setState({ pending: outcome, result: null, error: null });
    try {
      const data = await api("/billing/mock/complete", {
        method: "POST",
        body: { subscriptionId, outcome },
      });
      await reloadUser();
      setState({ pending: null, result: { outcome, plan: data.plan }, error: null });
    } catch (error) {
      setState({ pending: null, result: null, error: error.message });
    }
  };

  if (!subscriptionId) return <Alert>This checkout link is incomplete.</Alert>;

  const { pending, result, error } = state;
  if (result) {
    const paid = result.outcome === "success";
    return (
      <div className="space-y-4">
        <Alert tone={paid ? "good" : "bad"}>
          {paid
            ? `Payment successful. You are on the ${titleCase(result.plan)} plan.`
            : "Payment failed. Your plan has not changed."}
        </Alert>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/websites">Go to websites</ButtonLink>
          <ButtonLink href="/billing" variant="secondary">
            Back to billing
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <Card className="space-y-4">
      <p className="text-sm">
        This page stands in for a payment gateway. Choose what the gateway should report.
      </p>
      <Alert>{error}</Alert>
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => complete("success")}
          pending={pending === "success"}
          disabled={pending !== null}
        >
          Pay successfully
        </Button>
        <Button
          variant="danger"
          onClick={() => complete("failure")}
          pending={pending === "failure"}
          disabled={pending !== null}
        >
          Simulate failed payment
        </Button>
      </div>
    </Card>
  );
}

export default function MockCheckoutPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="Test checkout">No card needed and no money is charged.</PageTitle>
      <Suspense fallback={<Loading rows={1} />}>
        <Checkout />
      </Suspense>
    </div>
  );
}
