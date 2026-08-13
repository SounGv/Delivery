const PUBLIC_PAGES = new Set(["claim"])

export function readHashPage(): string {
  const hash = window.location.hash.replace(/^#\/?/, "").split("?")[0]?.replace(/\/$/, "") ?? ""
  if (hash) return hash
  return new URLSearchParams(window.location.search).get("page") || "dashboard"
}

export function navigateHash(page: string) {
  const next = `#/${page}`
  if (window.location.hash !== next) window.location.hash = next
}

export function isPublicPage(page: string): boolean {
  return PUBLIC_PAGES.has(page)
}
