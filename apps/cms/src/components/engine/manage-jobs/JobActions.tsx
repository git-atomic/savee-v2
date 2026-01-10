"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pause,
  Play,
  Square,
  Trash2,
  PlayCircle,
  Zap,
  RefreshCw,
  FileText,
  Pencil,
  MoreVertical,
} from "lucide-react";

interface JobActionsProps {
  jobId: string;
  status: string;
  runStatus?: string;
  runId?: string;
  onPause: (jobId: string) => void;
  onResume: (jobId: string) => void;
  onStop: (jobId: string) => void;
  onDelete: (jobId: string) => void;
  onRunNow?: (jobId: string) => void;
  onForceRun?: (jobId: string) => void;
  onReconcile?: (runId: string) => void;
  onToggleLogs?: (jobId: string) => void;
  onEdit?: (jobId: string) => void;
  isProcessing?: boolean;
  showLogs?: boolean;
}

export function JobActions({
  jobId,
  status,
  runStatus,
  runId,
  onPause,
  onResume,
  onStop,
  onDelete,
  onRunNow,
  onForceRun,
  onReconcile,
  onToggleLogs,
  onEdit,
  isProcessing = false,
  showLogs = false,
}: JobActionsProps) {
  const canPause = status === "running" || status === "active";
  const canResume = status === "paused";
  const canStop =
    status === "running" || status === "paused" || status === "active";
  const canRunNow = status !== "running";
  const isStale = runStatus === "stale";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={isProcessing}
          className="h-7 w-7"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {canPause && (
          <DropdownMenuItem
            onClick={() => onPause(jobId)}
            disabled={isProcessing}
          >
            <Pause className="h-4 w-4 mr-2" />
            Pause
          </DropdownMenuItem>
        )}

        {canResume && (
          <DropdownMenuItem
            onClick={() => onResume(jobId)}
            disabled={isProcessing}
          >
            <Play className="h-4 w-4 mr-2" />
            Resume
          </DropdownMenuItem>
        )}

        {canRunNow && onRunNow && (
          <DropdownMenuItem
            onClick={() => onRunNow(jobId)}
            disabled={isProcessing}
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            Run Now
          </DropdownMenuItem>
        )}

        {onForceRun && (
          <DropdownMenuItem
            onClick={() => onForceRun(jobId)}
            disabled={isProcessing}
          >
            <Zap className="h-4 w-4 mr-2" />
            Force Run
          </DropdownMenuItem>
        )}

        {canStop && (
          <DropdownMenuItem
            onClick={() => onStop(jobId)}
            disabled={isProcessing}
          >
            <Square className="h-4 w-4 mr-2" />
            Stop
          </DropdownMenuItem>
        )}

        {isStale && onReconcile && runId && (
          <DropdownMenuItem
            onClick={() => onReconcile(runId)}
            disabled={isProcessing}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reconcile
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {onToggleLogs && (
          <DropdownMenuItem
            onClick={() => onToggleLogs(jobId)}
            disabled={isProcessing}
          >
            <FileText className="h-4 w-4 mr-2" />
            {showLogs ? "Hide Logs" : "View Logs"}
          </DropdownMenuItem>
        )}

        {onEdit && (
          <DropdownMenuItem
            onClick={() => onEdit(jobId)}
            disabled={isProcessing}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => onDelete(jobId)}
          disabled={isProcessing}
          variant="destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
