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
    card: readCssVar("--card", "#ffffff"),
    gold: "#ffd23f",
    coral: "#ef6c4a",
    sky: "#5dade2",
    // Distinct line colors for many-series charts (rank trend with one line per person).
    linePalette: ["#2ba8a2", "#ef6c4a", "#ffd23f", "#5dade2", "#27ae60", "#ec6a98", "#8b7be0", "#f59e0b", "#1e8c86", "#d45233"],
    tooltip: {
      backgroundColor: readCssVar("--card", "#ffffff"),
      borderColor: readCssVar("--border", "#cfe6e4"),
      textStyle: { color: readCssVar("--foreground", "#17302f") },
      extraCssText: "border-radius:12px;box-shadow:0 8px 24px rgba(43,168,162,0.18);",
    },
    brand: "#2ba8a2",
    emerald: "#27ae60",
    amber: "#f59e0b",
    rose: "#e74c3c",
    // Ordered bar-series palette + the trend/target line accent used by
    // BarLineChart — Flip7 palette (teal / gold / sky bars, coral line).
    barColors: ["#2ba8a2", "#ffd23f", "#5dade2", "#ef6c4a"],
    trendLine: "#ef6c4a",
  }
}
