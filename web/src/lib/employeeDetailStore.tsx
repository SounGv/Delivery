import { createContext, useContext, useState, type ReactNode } from "react"

interface EmployeeDetailContextValue {
  /** Name of the employee currently shown in the drawer, or null when closed. */
  openName: string | null
  openEmployeeDetail: (name: string) => void
  close: () => void
}

const EmployeeDetailContext = createContext<EmployeeDetailContextValue | null>(null)

/** Mounted once around <AppShell> so any page (Dashboard's follow-up table, Live
 * Warehouse's cards, Performance's ranking) can open the same Employee Detail
 * drawer without page-to-page navigation or losing its own in-flight filters. */
export function EmployeeDetailProvider({ children }: { children: ReactNode }) {
  const [openName, setOpenName] = useState<string | null>(null)
  return (
    <EmployeeDetailContext.Provider value={{ openName, openEmployeeDetail: setOpenName, close: () => setOpenName(null) }}>
      {children}
    </EmployeeDetailContext.Provider>
  )
}

export function useEmployeeDetail() {
  const ctx = useContext(EmployeeDetailContext)
  if (!ctx) throw new Error("useEmployeeDetail must be used within EmployeeDetailProvider")
  return ctx
}
