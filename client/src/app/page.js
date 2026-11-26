import HomeActions from "@/components/HomeActions";
import { Card } from "@/components/ui";

const STEPS = [
  ["Add your website", "We check that it exists, then queue the first audit."],
  ["Audits run on schedule", "Daily, hourly or every 15 minutes, with a score out of 100."],
  ["Know what to update", "Paid plans get AI suggestions on SEO, speed, access and content."],
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">FlowPilot</h1>
        <p className="mx-auto mt-3 max-w-md text-zinc-600 dark:text-zinc-400">
          Scheduled website audits with AI suggestions on what to update.
        </p>
        <HomeActions />
      </div>
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map(([title, text], index) => (
          <li key={title}>
            <Card className="h-full">
              <p className="text-sm font-semibold text-teal-700 dark:text-teal-400">{index + 1}</p>
              <p className="mt-1 font-medium">{title}</p>
              <p className="mt-1 text-sm text-zinc-500">{text}</p>
            </Card>
          </li>
        ))}
      </ol>
    </main>
  );
}
