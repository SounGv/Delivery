# One-off sheet maintenance scripts

Run by hand from the Apps Script editor, never from the web app. This folder is outside the `clasp` root (`apps-script/`), so `clasp push` does not upload it.

Every script that writes has a `dryRun…` function. Run that first, read what it reports (rows read, matched, to change, sample before/after), and only then run the real one.

| File | What it did |
|---|---|
| `DedupeOfflineOrders.js` | Removes duplicate rows from the offline order report |
| `DeleteAugustOfflineRows.js` | Deletes the August 2026 rows of the offline order report (run after the dedupe) |
| `FillAugustOrderReports.js` | Fills the August order reports |
| `InsertOfflineAugust.js` | Inserts the August offline rows |
| `ReplaceAugustOnline.js` | Replaces bad August online rows |
| `InsertStoreReportOct0114.js` | Inserts the store report for 1–14 Oct |
| `DiagStorePerm.js`, `InspectOfflineRange.js`, `VerifySheetParserFix.js` | Read-only checks |

These were written for specific months and sheets. Read a script before running it again.
