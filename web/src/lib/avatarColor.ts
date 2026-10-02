/** Flip7 palette (teal / coral / gold / sky / success / pink) — avatars pick one
 * deterministically by name so the same person always renders the same color. */
const PALETTE: { light: string; base: string; dark: string }[] = [
  { light: "#7adbd6", base: "#2ba8a2", dark: "#1e8c86" }, // primary teal
  { light: "#ff8a6a", base: "#ef6c4a", dark: "#d45233" }, // coral
  { light: "#ffe47a", base: "#ffd23f", dark: "#e6b800" }, // accent gold
  { light: "#9acff0", base: "#5dade2", dark: "#3a86b5" }, // sky blue
  { light: "#7bd99f", base: "#27ae60", dark: "#1c7c44" }, // success green
  { light: "#f8b4c8", base: "#ec6a98", dark: "#b8456f" }, // pink
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
