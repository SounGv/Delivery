/** A small on-theme palette (matches the gradients used across KpiCard/charts) — avatars pick
 * one deterministically by name so the same person always renders the same color. */
const PALETTE: { light: string; base: string; dark: string }[] = [
  { light: "#93c5fd", base: "#3b82f6", dark: "#1d4ed8" }, // brand blue
  { light: "#6ee7b7", base: "#10b981", dark: "#047857" }, // emerald
  { light: "#fcd34d", base: "#f59e0b", dark: "#b45309" }, // amber
  { light: "#c4b5fd", base: "#8b5cf6", dark: "#6d28d9" }, // violet
  { light: "#fda4af", base: "#f43f5e", dark: "#be123c" }, // rose
  { light: "#67e8f9", base: "#06b6d4", dark: "#0e7490" }, // cyan
  { light: "#fdba74", base: "#f97316", dark: "#c2410c" }, // orange
  { light: "#a5f3fc", base: "#14b8a6", dark: "#0f766e" }, // teal
]

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function colorForName(name: string) {
  return PALETTE[hashName(name) % PALETTE.length] ?? PALETTE[0]!
}
