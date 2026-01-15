"use client";

import { useEffect, useRef } from "react";

interface PerformanceMetrics {
  loadTime?: number;
  renderTime?: number;
  imageLoadTime?: number;
}

export function usePerformanceMetrics(componentName: string) {
  const startTimeRef = useRef<number>(performance.now());
  const metricsRef = useRef<PerformanceMetrics>({});

  useEffect(() => {
    const loadTime = performance.now() - startTimeRef.current;
    metricsRef.current.loadTime = loadTime;

    // Log to analytics in production
    if (process.env.NODE_ENV === "production" && typeof window !== "undefined") {
      // TODO: Send to analytics service
      console.debug(`[Performance] ${componentName} loaded in ${loadTime.toFixed(2)}ms`);
    }
  }, [componentName]);

  const recordImageLoad = (imageUrl: string, loadTime: number) => {
    metricsRef.current.imageLoadTime = loadTime;
    if (process.env.NODE_ENV === "production") {
      console.debug(`[Performance] Image loaded: ${imageUrl} in ${loadTime.toFixed(2)}ms`);
    }
  };

  return { metrics: metricsRef.current, recordImageLoad };
}
