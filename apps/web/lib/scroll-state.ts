const PREFIX = "flow:scroll:";

function canUseWindow(): boolean {
  return typeof window !== "undefined";
}

export function saveScrollPosition(key: string): void {
  if (!canUseWindow()) return;
  try {
    sessionStorage.setItem(`${PREFIX}${key}`, String(window.scrollY || 0));
  } catch {
    // Ignore storage failures.
  }
}

export function restoreScrollPosition(key: string): void {
  if (!canUseWindow()) return;
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${key}`);
    if (raw == null) return;
    const nextY = Number(raw);
    if (Number.isFinite(nextY) && nextY >= 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: nextY, left: 0, behavior: "auto" });
      });
    }
  } catch {
    // Ignore storage failures.
  }
}
