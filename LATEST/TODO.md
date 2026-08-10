# TODO: Track Ticket Lookup — Security Fix

## Status: ✅ DONE (Reverted)

## What Happened
Partial/fuzzy ticket-number matching was briefly added to the "Track Ticket
Status" modal, but it was **removed** because it weakens the two-factor
security verification designed into the lookup.

## Why Partial Matching Was Removed
The Track Ticket lookup is a **two-factor security check**:
1. Exact ticket number (document ID)
2. Contact/Email credential match

Partial/fuzzy matching would let a user enumerate or guess partial ticket
numbers and probe the system, reducing the security of the verification flow.

## Final State of `submit-ticket.html`
- `lookupTicket()` performs an **exact** document-ID lookup only.
- Contact/email must match exactly.
- The input placeholder is back to `e.g. bnw-tix001` (no "(partial OK)").
- All corrupted editing artifacts were removed; the file was fully restored.
