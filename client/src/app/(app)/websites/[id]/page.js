import { Suspense } from "react";
import { Loading } from "@/components/ui";
import WebsiteDetail from "@/components/WebsiteDetail";

export default function WebsitePage() {
  return (
    <Suspense fallback={<Loading label="Loading website" />}>
      <WebsiteDetail />
    </Suspense>
  );
}
