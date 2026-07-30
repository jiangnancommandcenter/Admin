# Status: COMPLETED

## Changes Made

### 1. `script.js` - Rewrote `generateMonthlyIncidents()`
- **Root Cause:** The function was re-fetching logs from Firestore per-branch via `getBranchLogsInRange()`, which could return empty due to timestamp mismatches, permission issues, or race conditions
- **Fix:** Now uses the already-loaded `allLogs` array (same data powering the Status History tab) instead of per-branch Firestore queries
- Filters logs by current month date range
- Groups by branch name
- Sorts ascending by dateTime per branch
- Pairs Offline → Online transitions into incidents
- Includes currently-offline branches as ongoing incidents
- Adds a fallback for branches that are offline but have no logs this month

### 2. `main.html` - Removed "Jiangnan CCTV Command Center" text from print header
- Removed the `<h1>Jiangnan CCTV Command Center</h1>` line from the printable report header

## No Changes Needed
- Print table format (columns) - already correct
- `printMonthlyReport()` function - already correct
- Print CSS styles - already correct

## Status: ✅ DONE

### Changes Made
- **`script.js`**: Rewrote `generateMonthlyIncidents()` to use `allLogs` array instead of per-branch Firestore queries
  - Filters `allLogs` by current month date range
  - Groups logs by branch name
  - Sorts each branch's logs ascending by dateTime
  - Pairs Offline → Online sequences as incidents
  - Includes currently-offline branches as ongoing incidents
  - Falls back to branch data for branches with no logs but currently offline
- **Print table format** is unchanged - same columns, same layout

