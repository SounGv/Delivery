import type { Employee, MealsReportData } from "@/api/types"
import { addDaysIso, previousRange, type DateRange, type DayCount } from "@/lib/return-report"

/**
 * Figures for the "เบิกค่าข้าว" page, from the team workbook tab of the same name (see loadMealClaims_ in
 * apps-script/SheetParser.js): the allowance each person claimed per day, and late-stay time of people who do not claim
 * separately. Money is only added up from the cells; nothing is priced by a rule the sheet does not state.
 */

/** Everyone who claimed in the tab so far left at this time or later (normal end of the day is 18:00). Seen in the data,
 * not stated by the team — the page says so. */
export const LATE_CHECKOUT_FROM = "19:00"

export const CLAIM_LABEL = "เบิกค่าข้าว"
/** The late-stay block of the tab is the OT of daily-wage staff (the team's rule: 60 minutes counts as 1 hour). */
export const LATE_LABEL = "OT พนักงานรายวัน"

/** Hours of OT from minutes of late stay: 60 minutes = 1 hour. */
export const otHours = (minutes: number): number => minutes / 60

/** A name as written in the tab "เบิกค่าข้าว" -> the same person as written in the team output sheet. The two sheets are typed by
 * hand and match names letter for letter, so a different spelling looks like a missing person.
 * shortcut: hand-kept list; add a line when `notFound` shows a name that is only spelled differently. */
export const NAME_ALIASES: Record<string, string> = { เอิท: "เอิร์ท" }

const inRange = (day: string, r: DateRange) => !!day && day >= r.from && day <= r.to

/** The newest day with a claim or a late stay in the tab (the tab has columns for days still to come). */
export function latestMealDate(report: MealsReportData): string | null {
  let latest: string | null = null
  const see = (d: string) => {
    if (latest === null || d > latest) latest = d
  }
  for (const p of report.claims) for (const [d, amount] of Object.entries(p.byDate)) if (amount > 0) see(d)
  for (const p of report.lateStays) for (const [d, v] of Object.entries(p.byDate)) if (v.minutes > 0) see(d)
  return latest
}

export interface MealPersonRow {
  name: string
  /** Days with a claim, the money, and which days. */
  claimDays: number
  amount: number
  claimDates: string[]
  lateDays: number
  lateMinutes: number
  lateDates: string[]
}

export interface MealSummary {
  range: DateRange
  amount: number
  /** Claims in the period (one person on one day = one). */
  claims: number
  /** Different people who claimed. */
  claimants: number
  amountBefore: number
  claimsBefore: number
  lateDays: number
  lateMinutes: number
  latePeople: number
}

/** Per-person rows (money first) and the totals for the period; `staff` narrows to one person. */
export function summarizeMeals(report: MealsReportData, range: DateRange, staff = ""): { summary: MealSummary; people: MealPersonRow[] } {
  const before = previousRange(range)
  const rows = new Map<string, MealPersonRow>()
  const row = (name: string): MealPersonRow => {
    let r = rows.get(name)
    if (!r) {
      r = { name, claimDays: 0, amount: 0, claimDates: [], lateDays: 0, lateMinutes: 0, lateDates: [] }
      rows.set(name, r)
    }
    return r
  }
  let amountBefore = 0
  let claimsBefore = 0
  for (const p of report.claims) {
    if (staff && p.name !== staff) continue
    row(p.name)
    for (const [d, amount] of Object.entries(p.byDate)) {
      if (amount <= 0) continue
      if (inRange(d, range)) {
        const r = row(p.name)
        r.claimDays += 1
        r.amount += amount
        r.claimDates.push(d)
      } else if (inRange(d, before)) {
        amountBefore += amount
        claimsBefore += 1
      }
    }
  }
  for (const p of report.lateStays) {
    if (staff && p.name !== staff) continue
    row(p.name)
    for (const [d, v] of Object.entries(p.byDate)) {
      if (v.minutes <= 0 || !inRange(d, range)) continue
      const r = row(p.name)
      r.lateDays += 1
      r.lateMinutes += v.minutes
      r.lateDates.push(d)
    }
  }
  const people = [...rows.values()]
    .map((r) => ({ ...r, claimDates: r.claimDates.sort(), lateDates: r.lateDates.sort() }))
    // people with nothing in the period are not listed
    .filter((r) => r.claimDays > 0 || r.lateDays > 0)
    .sort((a, b) => b.amount - a.amount || b.lateMinutes - a.lateMinutes || a.name.localeCompare(b.name))
  const summary: MealSummary = {
    range,
    amount: people.reduce((a, r) => a + r.amount, 0),
    claims: people.reduce((a, r) => a + r.claimDays, 0),
    claimants: people.filter((r) => r.claimDays > 0).length,
    amountBefore,
    claimsBefore,
    lateDays: people.reduce((a, r) => a + r.lateDays, 0),
    lateMinutes: people.reduce((a, r) => a + r.lateMinutes, 0),
    latePeople: people.filter((r) => r.lateDays > 0).length,
  }
  return { summary, people }
}

/** People per day for the `days` days ending on `end`: who claimed, and who stayed late without claiming. */
export function dailyMeals(report: MealsReportData, end: string, days: number, asOf: string | null, staff = ""): DayCount[] {
  const out: DayCount[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysIso(end, -i)
    out.push({ date, total: 0, byOrigin: {}, noData: !asOf || date > asOf })
  }
  const byDate = new Map(out.map((d) => [d.date, d]))
  const bump = (date: string, key: string) => {
    const d = byDate.get(date)
    if (!d) return
    d.total += 1
    d.byOrigin[key] = (d.byOrigin[key] ?? 0) + 1
  }
  for (const p of report.claims) {
    if (staff && p.name !== staff) continue
    for (const [d, amount] of Object.entries(p.byDate)) if (amount > 0) bump(d, CLAIM_LABEL)
  }
  for (const p of report.lateStays) {
    if (staff && p.name !== staff) continue
    for (const [d, v] of Object.entries(p.byDate)) if (v.minutes > 0) bump(d, LATE_LABEL)
  }
  return out
}

export interface DayLine {
  date: string
  amount: number
  claimed: { name: string; amount: number }[]
  late: { name: string; minutes: number }[]
}

/** One line per day that has anything in the period, newest first. */
export function dayLines(report: MealsReportData, range: DateRange, staff = ""): DayLine[] {
  const map = new Map<string, DayLine>()
  const line = (date: string) => {
    let l = map.get(date)
    if (!l) {
      l = { date, amount: 0, claimed: [], late: [] }
      map.set(date, l)
    }
    return l
  }
  for (const p of report.claims) {
    if (staff && p.name !== staff) continue
    for (const [d, amount] of Object.entries(p.byDate)) {
      if (amount <= 0 || !inRange(d, range)) continue
      const l = line(d)
      l.amount += amount
      l.claimed.push({ name: p.name, amount })
    }
  }
  for (const p of report.lateStays) {
    if (staff && p.name !== staff) continue
    for (const [d, v] of Object.entries(p.byDate)) {
      if (v.minutes <= 0 || !inRange(d, range)) continue
      line(d).late.push({ name: p.name, minutes: v.minutes })
    }
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export type MealCheckKind = "late-no-claim" | "claim-no-late"

export interface MealCheck {
  name: string
  date: string
  kind: MealCheckKind
  /** The latest check-out found for that name that day, "HH:mm"; null when the team output sheet has none. */
  checkOut: string | null
}

/** A person whose later days are still empty in the tab although they left at LATE_CHECKOUT_FROM or later on them. */
export interface MealUnfilled {
  name: string
  /** The last day the person has anything (a number or "-") in the tab; null when the row is entirely empty. */
  lastFilled: string | null
  days: { date: string; checkOut: string }[]
}

/** A person who claimed in the tab but has no name in the team output sheet, so their check-out cannot be compared. */
export interface MealNotFound {
  name: string
  /** The days in the period (up to the newest filled day) on which the person claimed. */
  days: string[]
}

/**
 * Lines worth a look, by comparing the claims with the check-out times of the team output sheet (same names, any crew):
 *  - left at LATE_CHECKOUT_FROM or later but no claim that day, where the team wrote "-" or left a gap between filled days
 *  - claimed but no check-out at that time or later (either an earlier time, or none recorded)
 * Cells after a person's last filled day are "not filled in yet", not "forgot to claim": those are returned apart in
 * `unfilled`, one entry per person. A claimant whose name is not in the team sheet at all (after NAME_ALIASES) is returned
 * apart in `notFound`: there is nothing to compare, which is not the same as "no check-out". Only people who have a row among the claimants, only days up to `asOf` (the newest day
 * the tab is filled to), only the period. This does not say anyone is wrong: the time rule is an observation, and the
 * sheets are filled by hand.
 */
export function crossCheckMeals(
  report: MealsReportData,
  employees: Employee[],
  range: DateRange,
  asOf: string | null
): { checks: MealCheck[]; unfilled: MealUnfilled[]; notFound: MealNotFound[] } {
  if (!asOf) return { checks: [], unfilled: [], notFound: [] }
  const byName = new Map<string, Employee[]>()
  for (const e of employees) byName.set(e.name, [...(byName.get(e.name) ?? []), e])
  const out: MealCheck[] = []
  const unfilled: MealUnfilled[] = []
  const notFound: MealNotFound[] = []
  for (const p of report.claims) {
    const people = byName.get(NAME_ALIASES[p.name] ?? p.name) ?? []
    if (people.length === 0) {
      const days = report.dates.filter((date) => inRange(date, range) && date <= asOf && (p.byDate[date] ?? 0) > 0)
      if (days.length > 0) notFound.push({ name: p.name, days })
      continue
    }
    // the cell exists in the payload when the team wrote something (a number, or "-" as 0)
    const lastFilled = Object.keys(p.byDate).sort().at(-1) ?? null
    const waiting: { date: string; checkOut: string }[] = []
    for (const date of report.dates) {
      if (!inRange(date, range) || date > asOf) continue
      const outs = people.map((e) => e.byDate[date]?.checkOut).filter((t): t is string => !!t)
      const latest = outs.length > 0 ? [...outs].sort().at(-1)! : null
      const claimed = (p.byDate[date] ?? 0) > 0
      const late = latest !== null && latest >= LATE_CHECKOUT_FROM
      if (late && !claimed) {
        if (lastFilled === null || date > lastFilled) waiting.push({ date, checkOut: latest })
        else out.push({ name: p.name, date, kind: "late-no-claim", checkOut: latest })
      } else if (claimed && !late) out.push({ name: p.name, date, kind: "claim-no-late", checkOut: latest })
    }
    if (waiting.length > 0) unfilled.push({ name: p.name, lastFilled, days: waiting.sort((a, b) => a.date.localeCompare(b.date)) })
  }
  return {
    checks: out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)),
    unfilled: unfilled.sort((a, b) => b.days.length - a.days.length || a.name.localeCompare(b.name)),
    notFound: notFound.sort((a, b) => a.name.localeCompare(b.name)),
  }
}
