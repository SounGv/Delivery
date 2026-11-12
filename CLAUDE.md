# teamklang — Warehouse dashboard

Web dashboard for the warehouse team ("แดชบอร์ดทีมคลัง"), read-only. Data comes from two Google Sheets through an Apps Script web app. Phones are the main screen; the desktop layout is the same app with a side menu.

## Layout

| Folder | What it is |
|---|---|
| `web/` | Vite + React + TypeScript + Tailwind v4 + TanStack Query. Deployed to Cloudflare Pages |
| `apps-script/` | The Apps Script web app the site reads (`Code.js` = routes, `SheetParser.js` = sheet readers). **Everything in this folder is pushed with `clasp push`**, so keep only code the web app uses |
| `apps-script-oneoff/` | One-off sheet maintenance scripts run by hand from the Apps Script editor (each has a `dryRun…` function: run it first). Outside the clasp root on purpose, so they are never pushed |
| `api/` | Optional FastAPI cache in front of the Apps Script web app (`main.py`, tests in `test_main.py`). The site reads it only when `VITE_API_BASE_URL` is set and falls back to Apps Script when it is down (`web/src/api/client.ts`) |

## Data sources (ids are in `apps-script/SheetParser.js`)

- Team report workbook "รายงานของทีม v2" (`TEAM_REPORT_SOURCE_ID_`): monthly tabs (`11-69` …) with per-person output, plus the BigSeller order and store report tabs.
- Workbook "gv-returns-sync" (`CANCELLED_SOURCE_ID_`): tabs `โฟกัสทีม-งานค้าง` (backlog queues, all formulas), `cn-restock`, `ได้เงินคืนแล้ว-พัสดุหาย`, the two cancelled-order reports, `platform-settle`, `วิธีใช้` (the team's own definitions of the queues).
- The site calls `?path=core|cancelled|focus|restock|refunds|stockValue|workPerformance` on the web app URL in `VITE_APPS_SCRIPT_URL` (see `web/.env.example`; the real value is a GitHub secret).

## Commands (run in `web/`)

```bash
npm run dev      # local server
npm run lint     # oxlint
npm test         # vitest (pure logic in src/lib)
npm run build    # tsc -b && vite build
```

CI (`.github/workflows/deploy-teamklang.yml`) runs lint, test, build, then deploys on every push to `main` that touches `web/**`. Lint and test run before any step that holds a secret.

Apps Script release (only when `apps-script/` changed; bump `CACHE_VERSION_` in `Code.js` when the parsed shape changes). Try it first on the TEST deployment (`clasp deployments` marks it "TEST … (not live)"), compare `?path=core` / `?path=restock` with the live URL, then deploy to the live id. Roll back with `clasp deploy --deploymentId <live id> --versionNumber <previous version>`. `cd apps-script && npx clasp push --force`, then `clasp deploy --deploymentId <live id>`. `clasp push --force` deletes remote files that are not in the folder, so check `git status` first. Check `clasp deployments` for the live version before changing anything.

## Rules this app follows

- **Per crew.** Online and offline crews each have their own "today" (their latest day with output). See `scopeDashboard` in `web/src/api/queries.ts`.
- **Roster, not totals.** Headcounts and the follow-up list count people with output in the last 30 days of their crew's data (`recentlyActiveEmployees`). Totals and history still count everyone. This is a shortcut for the 13 one-day alias/test names; replace it with a real alias → person mapping when the team supplies one.
- **One page for backlog, cancelled and returned goods**: menu "งานค้าง/ยกเลิก/ตีกลับ" (`web/src/pages/ReturnsHub.tsx`), tabs under four sub-headings. The old keys `returns`, `cancelled`, `timeline` still link to the matching tab.
- **Summary report** (tab "สรุปตีกลับและเงินคืน", `web/src/pages/ReturnSummary.tsx`, logic and tests in `web/src/lib/return-report.ts`). Default period = the 7 days ending on the newest day the returns data has (the returns file is pulled by hand and can be days behind; a calendar-day window would show 0). Definitions: *received* = returned goods whose "เวลาถึงคลัง" is in the period; *outstanding*, and the money stages "ยังไม่ได้ทำเรื่อง / ขอเงินคืนแล้ว รอเงิน / เงินเข้าแล้วยังไม่ลงบันทึก" = right now, any date (they are open work and most have no date); *ได้เงินคืนแล้ว* and *สูญหาย* = by the period; cancelled orders = by the order date. Money per refund case is the selling price from the refund tab (what the team's own sheet totals); a refund case is matched to a restock line by package + SKU. The rest of the page, top to bottom: ต้องตามวันนี้ (not-started first, then money in but not noted / arrived but not stocked in, longest wait first), รับคืนรายวัน (14 days; days after the newest data are hatched "no data", never 0), อันดับร้านค้า/ขนส่ง (carrier is read off the return tracking prefix, so often blank), ข้อมูลที่ต้องตรวจ, สินค้ายกเลิก, and the list. Every card and step has a matching list set (`Segment` in `return-report.ts`), so the list always adds up to the number above it. The reason column of `cn-restock` is not in the payload yet, so there is no ranking by reason.
- **Phone first.** Bottom bar + "เมนู" sheet; controls ≥ 44 px; wide tables become cards with class `stack-table` + `data-label` on each cell (`globals.css`); one type scale for headings and figures; long captions use `ClampText`; long lists show 10 rows per page on phones (`lib/page-size.ts`). Design rules come from the GV UI skill (`gv-ui-design`).
- **Status is never colour alone** (icon + word). Status colours (ok / warn / danger / info / neutral) are separate from the brand colours used for kinds and warehouses.
- **Wording.** Thai on every screen: "ออเดอร์" (not "คำสั่งซื้อ"), "ชีต", "เลยกำหนด", "ส่งออก … รายการ". Names of sheet tabs and sheet column headers are written exactly as the sheet writes them, because the team searches by them. Dates are shown as ค.ศ. like the sheets.

## Open questions

- "ตีกลับ" vs "คืนสินค้า": `cn-restock` column "ที่มา" has "คืนจากลูกค้า" (customer return) and "ยกเลิก-ตีกลับ" (carrier bounce). The app currently counts both as "ตีกลับ". Suggested names: "ลูกค้าส่งคืน" / "ขนส่งตีกลับ" — waiting for the warehouse team to confirm.
- ฝ่ายรับเข้า duplicate headings and numeric "names" (250, 300, …): cause found and fixed in `SheetParser.js` (months were merged by category number, but the team renumbered the categories between ก.ค. and ส. ค.; and a figure in the "ชื่อ" column was read as a person). Tested in `apps-script-tests/`. Verified on the TEST deployment; **not yet on the live deployment** (see "Apps Script release").
- Reason ranking (`cn-restock` column "เหตุผล"): the parser now sends `reason`; the page shows it as soon as the live deployment has it (until then it says so).

Decided: the year is shown as ค.ศ. on purpose (the code says "never Buddhist-era", to match the sheets), which is the repo's own decision the UI skill allows.
