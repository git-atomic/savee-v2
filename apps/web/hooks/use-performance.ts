"use client";

import { useCallback, useEffect, useState } from "react";

interface PerformanceMetrics {
  loadTime?: number;
  renderTime?: number;
  imageLoadTime?: number;
}

export function usePerformanceMetrics(componentName: string) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({});

  useEffect(() => {
    const startTime = performance.now();
    const rafId = requestAnimationFrame(() => {
      const loadTime = performance.now() - startTime;
      setMetrics((prev) => ({ ...prev, loadTime }));

      // Log to analytics in production
      if (
        process.env.NODE_ENV === "production" &&
        typeof window !== "undefined"
      ) {
        // TODO: Send to analytics service
        console.debug(
          `[Performance] ${componentName} loaded in ${loadTime.toFixed(2)}ms`
        );
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [componentName]);

  const recordImageLoad = useCallback((imageUrl: string, loadTime: number) => {
    setMetrics((prev) => ({ ...prev, imageLoadTime: loadTime }));
    if (process.env.NODE_ENV === "production") {
      console.debug(
        `[Performance] Image loaded: ${imageUrl} in ${loadTime.toFixed(2)}ms`
      );
    }
  }, []);

  return { metrics, recordImageLoad };
}
