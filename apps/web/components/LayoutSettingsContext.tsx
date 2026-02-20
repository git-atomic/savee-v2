"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

interface LayoutSettings {
  columns: number;
  gap: number; // spacing between blocks in pixels
}

const DEFAULT_COLUMNS = 5;
const DEFAULT_GAP = 32; // matches current GAP_SIZE

interface LayoutSettingsContextType {
  columns: number;
  gap: number;
  setColumns: (columns: number) => void;
  setGap: (gap: number) => void;
}

const LayoutSettingsContext = createContext<LayoutSettingsContextType | undefined>(undefined);

export function LayoutSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<LayoutSettings>(() => {
    // Initialize from localStorage or defaults
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("layout-settings");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          return {
            columns: parsed.columns ?? DEFAULT_COLUMNS,
            gap: parsed.gap ?? DEFAULT_GAP,
          };
        } catch {
          // Invalid JSON, use defaults
        }
      }
    }
    return {
      columns: DEFAULT_COLUMNS,
      gap: DEFAULT_GAP,
    };
  });

  // Persist to localStorage whenever settings change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("layout-settings", JSON.stringify(settings));
    }
  }, [settings]);

  const setColumns = useCallback((columns: number) => {
    setSettings((prev) =>
      prev.columns === columns ? prev : { ...prev, columns }
    );
  }, []);

  const setGap = useCallback((gap: number) => {
    setSettings((prev) => (prev.gap === gap ? prev : { ...prev, gap }));
  }, []);

  const value = useMemo(
    () => ({
      columns: settings.columns,
      gap: settings.gap,
      setColumns,
      setGap,
    }),
    [settings.columns, settings.gap, setColumns, setGap]
  );

  return (
    <LayoutSettingsContext.Provider value={value}>
      {children}
    </LayoutSettingsContext.Provider>
  );
}

export function useLayoutSettings() {
  const context = useContext(LayoutSettingsContext);
  if (context === undefined) {
    throw new Error("useLayoutSettings must be used within a LayoutSettingsProvider");
  }
  return context;
}
