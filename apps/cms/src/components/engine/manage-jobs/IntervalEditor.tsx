"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  const save = async (payload: any) => {
    try {
      const res = await fetch(`/api/engine/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast({
          title: "Settings Updated",
          description: "Interval settings have been updated",
        });
        onUpdated();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to update settings");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description:
          error instanceof Error ? error.message : "Failed to update settings",
      });
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          className="w-20 h-7 text-xs"
          type="number"
          placeholder="Interval"
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
        <span className="text-[10px] text-muted-foreground">s</span>
        <Label className="flex items-center gap-1.5 text-[10px]">
          <Switch
            checked={adaptive}
            onCheckedChange={(v) => {
              setAdaptive(Boolean(v));
              save({ disableBackoff: !v });
            }}
            size="sm"
          />
          Adaptive
        </Label>
      </div>
      {(effectiveIntervalSeconds !== undefined ||
        (backoffMultiplier && backoffMultiplier > 1)) && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {effectiveIntervalSeconds !== undefined && (
            <span>Eff: {effectiveIntervalSeconds}s</span>
          )}
          {backoffMultiplier && backoffMultiplier > 1 && (
            <span>• Backoff: x{backoffMultiplier}</span>
          )}
        </div>
      )}
    </div>
  );
}
