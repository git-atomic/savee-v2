"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { NumberStepper } from "@/components/ui/number-stepper";
import { cn } from "@/lib/utils";
import type { SourceType } from "@/lib/url-utils";

interface JobConfigPanelProps {
  sourceType: SourceType;
  onSourceTypeChange: (type: SourceType) => void;
  maxItems: number;
  onMaxItemsChange: (value: number) => void;
  urlCount?: number;
  showUrlCount?: boolean;
  disabled?: boolean;
}

const typeLabels: Record<SourceType, string> = {
  home: "Home",
  pop: "Pop",
  user: "User",
  blocks: "Blocks",
};

export function JobConfigPanel({
  sourceType,
  onSourceTypeChange,
  maxItems,
  onMaxItemsChange,
  urlCount = 0,
  showUrlCount = false,
  disabled = false,
}: JobConfigPanelProps) {
  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold">Config</h2>
        </div>

        <div className="flex-1 px-4 py-6 space-y-8">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Type</Label>

            <Select
              value={sourceType}
              onValueChange={(value) => onSourceTypeChange(value as SourceType)}
              disabled={disabled}
            >
              <SelectTrigger
                className={cn(
                  "w-full h-auto hover:bg-transparent cursor-pointer focus:ring-0 focus-visible:ring-0",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)]">
                <SelectGroup>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="pop">Pop</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="blocks">Blocks</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {showUrlCount && urlCount > 0 && (
              <Badge variant="outline" className="mt-2">
                {urlCount} URL{urlCount !== 1 ? "s" : ""} detected
              </Badge>
            )}
          </div>

          <Separator />

          <div className="flex flex-row items-center gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className="text-sm font-medium">Max Items</Label>
              <p className="text-xs text-muted-foreground">0 means unlimited</p>
            </div>
            <div className="flex items-center justify-end">
              <NumberStepper
                value={maxItems}
                onChange={onMaxItemsChange}
                min={0}
                step={1}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
