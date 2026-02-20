"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";

/**
 * Enterprise-grade shared Intersection Observer pool
 * Reuses observers across components for better performance
 */
class IntersectionObserverPool {
  private observers = new Map<string, IntersectionObserver>();
  private observerElements = new Map<string, Set<Element>>();
  private elementCallbacks = new Map<
    Element,
    Set<(entry: IntersectionObserverEntry) => void>
  >();
  private elementObserverKeys = new Map<Element, string>();

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
      root: options.root ? "custom-root" : "viewport",
      rootMargin: options.rootMargin || "0px",
      threshold: Array.isArray(options.threshold)
        ? options.threshold.join(",")
        : options.threshold || 0,
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

    if (!this.observerElements.has(key)) {
      this.observerElements.set(key, new Set());
    }

    const observedElements = this.observerElements.get(key)!;
    const existingKey = this.elementObserverKeys.get(element);
    if (existingKey && existingKey !== key) {
      const previousObserver = this.observers.get(existingKey);
      const previousSet = this.observerElements.get(existingKey);
      if (previousObserver && previousSet?.has(element)) {
        previousObserver.unobserve(element);
        previousSet.delete(element);
      }
    }

    if (!this.elementCallbacks.has(element)) {
      this.elementCallbacks.set(element, new Set());
    }

    if (!observedElements.has(element)) {
      observer.observe(element);
      observedElements.add(element);
      this.elementObserverKeys.set(element, key);
    }
    this.elementCallbacks.get(element)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.elementCallbacks.get(element);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.elementCallbacks.delete(element);
          const observerKey = this.elementObserverKeys.get(element);
          const boundObserver = observerKey
            ? this.observers.get(observerKey)
            : observer;
          const boundElements = observerKey
            ? this.observerElements.get(observerKey)
            : this.observerElements.get(key);
          boundObserver?.unobserve(element);
          boundElements?.delete(element);
          this.elementObserverKeys.delete(element);

          if (observerKey && boundElements && boundElements.size === 0) {
            boundObserver?.disconnect();
            this.observers.delete(observerKey);
            this.observerElements.delete(observerKey);
          }
        }
      }
    };
  }

  disconnect() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
    this.observerElements.clear();
    this.elementCallbacks.clear();
    this.elementObserverKeys.clear();
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
  const optionsRef = useRef<IntersectionObserverInit>(options);

  const normalizedOptions = useMemo<IntersectionObserverInit>(
    () => ({
      root: options.root ?? null,
      rootMargin: options.rootMargin ?? "0px",
      threshold: options.threshold ?? 0,
    }),
    [options.root, options.rootMargin, options.threshold]
  );

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    optionsRef.current = normalizedOptions;
  }, [normalizedOptions]);

  const setElement = useCallback(
    (element: Element | null) => {
      if (elementRef.current === element) {
        return;
      }

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
          optionsRef.current
        );
      }
    },
    []
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
