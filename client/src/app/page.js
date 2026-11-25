import ApiStatus from "@/components/ApiStatus";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">FlowPilot</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Scheduled website audits with AI suggestions on what to update.
      </p>
      <ApiStatus />
    </main>
  );
}
