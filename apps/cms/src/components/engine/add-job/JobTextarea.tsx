"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface JobTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function JobTextarea({
  value,
  onChange,
  placeholder = "Enter savee.it URL or paste multiple item URLs...",
  className,
  disabled = false,
}: JobTextareaProps) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={12}
      className={cn(
        "h-full min-h-64 max-h-full w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent [field-sizing:fixed] focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none",
        className
      )}
    />
  );
}
