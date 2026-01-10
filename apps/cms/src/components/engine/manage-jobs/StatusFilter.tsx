"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusKey =
  | "running"
  | "queued"
  | "active"
  | "paused"
  | "stopped"
  | "error"
  | "completed";

interface StatusOption {
  key: StatusKey;
  label: string;
  dotColor: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { key: "running", label: "Running", dotColor: "bg-emerald-500" },
  { key: "queued", label: "Queued", dotColor: "bg-amber-500" },
  { key: "active", label: "Active", dotColor: "bg-blue-500" },
  { key: "paused", label: "Paused", dotColor: "bg-zinc-500" },
  { key: "stopped", label: "Stopped", dotColor: "bg-purple-500" },
  { key: "error", label: "Error", dotColor: "bg-red-500" },
  { key: "completed", label: "Completed", dotColor: "bg-sky-500" },
];

interface StatusFilterProps {
  selected: Set<StatusKey>;
  onChange: (selected: Set<StatusKey>) => void;
}

export function StatusFilter({
  selected,
  onChange,
}: StatusFilterProps) {
  const handleToggle = (key: StatusKey) => {
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {STATUS_OPTIONS.map((option) => {
        const isSelected = selected.has(option.key);
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => handleToggle(option.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
              isSelected
                ? "border-border bg-background text-foreground shadow-sm"
                : "border-border/50 bg-input/30 text-muted-foreground hover:bg-input/50 hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                option.dotColor
              )}
            />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
