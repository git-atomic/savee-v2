"use client";

import * as React from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  disabled = false,
  className,
}: NumberStepperProps) {
  const [inputValue, setInputValue] = React.useState(String(value));

  React.useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleIncrement = () => {
    const newValue =
      max !== undefined ? Math.min(value + step, max) : value + step;
    onChange(newValue);
  };

  const handleDecrement = () => {
    const newValue = Math.max(value - step, min);
    onChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    const numValue = parseInt(newValue, 10);
    if (!isNaN(numValue)) {
      let clampedValue = numValue;
      if (min !== undefined) clampedValue = Math.max(clampedValue, min);
      if (max !== undefined) clampedValue = Math.min(clampedValue, max);
      onChange(clampedValue);
    } else if (newValue === "") {
      // Allow empty input temporarily
      setInputValue("");
    }
  };

  const handleInputBlur = () => {
    // Reset to current value if invalid
    if (inputValue === "" || isNaN(parseInt(inputValue, 10))) {
      setInputValue(String(value));
    }
  };

  const isDecrementDisabled = disabled || value <= min;
  const isIncrementDisabled = disabled || (max !== undefined && value >= max);

  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "cn-button-group flex w-fit items-stretch",
        "cn-button-group-orientation-horizontal",
        "[&>*]:focus-visible:z-10 [&>*]:focus-visible:relative",
        "[&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit",
        "[&>input]:flex-1",
        "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0",
        "[&>*:not(:last-child)]:rounded-r-none",
        className
      )}
    >
      <Input
        type="text"
        inputMode="numeric"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        size={3}
        maxLength={3}
        disabled={disabled}
        data-slot="input"
        className="text-center"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleDecrement}
        disabled={isDecrementDisabled}
        aria-label="Decrement"
      >
        <MinusIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleIncrement}
        disabled={isIncrementDisabled}
        aria-label="Increment"
      >
        <PlusIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}
