"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ComponentExample() {
  return (
    <div className="flex flex-col min-h-[70vh] items-center justify-center">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Engine Foundation</h1>
        <p className="text-muted-foreground text-sm">
          A clean slate for the ScrapeSavee Engine.
        </p>
        <Select>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Theme" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectItem value="light">Light</SelectItem>
      <SelectItem value="dark">Dark</SelectItem>
      <SelectItem value="system">System</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
      </div>
    </div>
  );
}
