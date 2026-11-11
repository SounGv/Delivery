/** Rows per page in the long card lists: a phone gets 10 so the page does not scroll for thousands of pixels.
 * Read once when the app loads, so a phone turned sideways keeps the size it started with. */
export const LIST_PAGE_SIZE = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches ? 10 : 30
