function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** Resolves current theme colors from CSS custom properties into literal values ECharts' canvas renderer can use. */
export function readChartTheme() {
  return {
    muted: readCssVar("--muted-foreground", "#94a3b8"),
    border: readCssVar("--border", "rgba(255,255,255,0.1)"),
    foreground: readCssVar("--foreground", "#f1f5f9"),
    brand: "#3b82f6",
    emerald: "#10b981",
    amber: "#f59e0b",
    rose: "#f87171",
  }
}
