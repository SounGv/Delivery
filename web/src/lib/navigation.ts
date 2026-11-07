import { createContext, useContext } from "react"

/** Lets a page send the user to another menu entry (the overview's "ต้องตามวันนี้" tiles).
 * App owns the current page; the default does nothing so a page rendered alone still works. */
export const NavigateContext = createContext<(pageKey: string) => void>(() => {})

export const useNavigate = () => useContext(NavigateContext)
