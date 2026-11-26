export const SCHEDULES = [
  { id: "15m", label: "Every 15 minutes", minutes: 15 },
  { id: "hourly", label: "Hourly", minutes: 60 },
  { id: "daily", label: "Daily", minutes: 1440 },
];

export const STATUS_LABELS = {
  queued: "Queued",
  running: "Running",
  success: "Completed",
  failed: "Failed",
};

export const isPending = (status) => status === "queued" || status === "running";

const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

export const formatDate = (value) => (value ? dateTime.format(new Date(value)) : "Not yet");

export const formatBytes = (bytes) =>
  bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export const titleCase = (value) =>
  value === "seo" ? "SEO" : value.charAt(0).toUpperCase() + value.slice(1);
