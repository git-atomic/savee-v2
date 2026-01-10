"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  className,
  id,
  disabled = false,
}: NumberStepperProps) {
  const handleDecrement = () => {
    const newValue = Math.max(min, value - step);
    onChange(newValue);
  };

  const handleIncrement = () => {
    const newValue =
      max !== undefined ? Math.min(max, value + step) : value + step;
    onChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "") {
      onChange(0);
      return;
    }
    const numValue = parseInt(val, 10);
    if (!isNaN(numValue)) {
      let finalValue = numValue;
      if (min !== undefined && numValue < min) finalValue = min;
      if (max !== undefined && numValue > max) finalValue = max;
      onChange(finalValue);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || isNaN(parseInt(val, 10))) {
      onChange(min);
    }
  };

  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "flex w-fit items-stretch [&>*]:focus-visible:z-10 [&>*]:focus-visible:relative [&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
        className
      )}
    >
      <Input
        data-slot="input"
        id={id}
        type="text"
        inputMode="numeric"
        size={3}
        maxLength={3}
        value={value}
        onChange={handleInputChange}
        onBlur={handleBlur}
        disabled={disabled}
        className="w-auto min-w-[3ch] text-center rounded-r-none"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        aria-label="Decrement"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleIncrement}
        disabled={disabled || (max !== undefined && value >= max)}
        aria-label="Increment"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
