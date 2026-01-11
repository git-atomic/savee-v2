"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play, Square, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrimaryControlsProps {
  status: string;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRunNow?: () => void;
  isProcessing?: boolean;
}

export function PrimaryControls({
  status,
  onPause,
  onResume,
  onStop,
  onRunNow,
  isProcessing = false,
}: PrimaryControlsProps) {
  const canPause = status === "running" || status === "active";
  const canResume = status === "paused";
  const canStop =
    status === "running" || status === "paused" || status === "active";
  const canRunNow = status !== "running";

  return (
    <div className="flex items-center gap-1.5">
      {canPause && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onPause}
          disabled={isProcessing}
          className="h-7 px-2"
          title="Pause"
        >
          <Pause className="h-3.5 w-3.5" />
        </Button>
      )}

      {canResume && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onResume}
          disabled={isProcessing}
          className="h-7 px-2"
          title="Resume"
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
      )}

      {canStop && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onStop}
          disabled={isProcessing}
          className="h-7 px-2"
          title="Stop"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      )}

      {canRunNow && onRunNow && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRunNow}
          disabled={isProcessing}
          className="h-7 px-2 text-xs"
          title="Run Now"
        >
          <PlayCircle className="h-3.5 w-3.5 mr-1" />
          Run
        </Button>
      )}
    </div>
  );
}
