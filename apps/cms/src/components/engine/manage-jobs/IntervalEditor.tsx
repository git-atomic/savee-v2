"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface IntervalEditorProps {
  jobId: string;
  intervalSeconds?: number;
  disableBackoff?: boolean;
  effectiveIntervalSeconds?: number;
  backoffMultiplier?: number;
  onUpdated: () => void;
}

export function IntervalEditor({
  jobId,
  intervalSeconds,
  disableBackoff,
  effectiveIntervalSeconds,
  backoffMultiplier,
  onUpdated,
}: IntervalEditorProps) {
  const [intervalVal, setIntervalVal] = React.useState<string>(
    String(intervalSeconds ?? effectiveIntervalSeconds ?? "")
  );
  const [adaptive, setAdaptive] = React.useState<boolean>(
    !(disableBackoff ?? false)
  );

  const save = async (payload: any) => {
    try {
      const res = await fetch(`/api/engine/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Settings Updated", {
          description: "Interval settings have been updated",
        });
        onUpdated();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to update settings");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update Failed");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        className="w-28 h-8"
        type="number"
        placeholder="Interval (s)"
        value={intervalVal}
        onChange={(e) => setIntervalVal(e.target.value)}
        onBlur={() => {
          const trimmed = intervalVal.trim();
          if (trimmed === "") {
            save({ intervalSeconds: null });
            return;
          }
          const n = parseInt(trimmed, 10);
          if (!Number.isNaN(n)) {
            save({ intervalSeconds: n });
          }
        }}
      />
      <span className="text-[10px] text-muted-foreground">seconds</span>
      <label className="flex items-center gap-2 text-xs">
        <Switch
          checked={adaptive}
          onCheckedChange={(v) => {
            setAdaptive(Boolean(v));
            save({ disableBackoff: !v });
          }}
        />
        <span className="text-xs">Adaptive</span>
      </label>
    </div>
  );
}
