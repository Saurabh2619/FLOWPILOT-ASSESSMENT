"use client";

import { SCHEDULES } from "@/lib/format";
import { Button, Select } from "./ui";

export default function WebsiteControls({ site, limits, onUpdate, onDelete }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        label={`Schedule for ${site.url}`}
        hideLabel
        value={site.schedule}
        onChange={(event) => onUpdate({ schedule: event.target.value })}
        className="w-44"
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
      <Button variant="secondary" onClick={() => onUpdate({ active: !site.active })}>
        {site.active ? "Pause" : "Resume"}
      </Button>
      <Button variant="danger" onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}
