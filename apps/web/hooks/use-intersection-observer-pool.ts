"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Enterprise-grade shared Intersection Observer pool
 * Reuses observers across components for better performance
 */
class IntersectionObserverPool {
  private observers = new Map<string, IntersectionObserver>();
  private elementCallbacks = new Map<Element, Set<(entry: IntersectionObserverEntry) => void>>();

  private createObserver(options: IntersectionObserverInit): IntersectionObserver {
    return new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const callbacks = this.elementCallbacks.get(entry.target);
          if (callbacks) {
            callbacks.forEach((callback) => callback(entry));
          }
        });
      },
      options
    );
  }

  private getObserverKey(options: IntersectionObserverInit): string {
    return JSON.stringify({
      rootMargin: options.rootMargin || "0px",
      threshold: options.threshold || 0,
    });
  }

  observe(
    element: Element,
    callback: (entry: IntersectionObserverEntry) => void,
    options: IntersectionObserverInit = {}
  ): () => void {
    const key = this.getObserverKey(options);
    let observer = this.observers.get(key);

    if (!observer) {
      observer = this.createObserver(options);
      this.observers.set(key, observer);
    }

    // Add callback for this element
    if (!this.elementCallbacks.has(element)) {
      this.elementCallbacks.set(element, new Set());
      observer.observe(element);
    }
    this.elementCallbacks.get(element)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.elementCallbacks.get(element);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.elementCallbacks.delete(element);
          observer?.unobserve(element);
        }
      }
    };
  }

  disconnect() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
    this.elementCallbacks.clear();
  }
}

// Singleton instance
const observerPool = new IntersectionObserverPool();

/**
 * Hook to use shared intersection observer pool
 */
export function useIntersectionObserverPool(
  callback: (isIntersecting: boolean) => void,
  options: IntersectionObserverInit = {}
) {
  const elementRef = useRef<Element | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const setElement = useCallback(
    (element: Element | null) => {
      // Cleanup previous
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      elementRef.current = element;

      if (element) {
        unsubscribeRef.current = observerPool.observe(
          element,
          (entry) => {
            callbackRef.current(entry.isIntersecting);
          },
          options
        );
      }
    },
    [options]
  );

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  return setElement;
}
