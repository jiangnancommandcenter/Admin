# Ticket Attachments (Cloudinary) — Implementation Steps

## Flow
- **Admin** (main.html) attaches files to a ticket via the Ticket Details modal → uploaded to Cloudinary → metadata saved in the ticket's Firestore `attachments` array.
- **Branch users** (submit-ticket.html) view those attachments inside the existing "Track Ticket Status" result card.

## Steps
- [x] Analyze submit-ticket.html, main.html, script.js, firebase.js
- [x] Get user approval on plan

- [ ] **Edit 1 — main.html**: Add Attachments section (file input + upload button + grid) to the Ticket Details modal
- [ ] **Edit 2 — script.js**: Add Cloudinary config constants (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`)
- [ ] **Edit 3 — script.js**: Add upload / render / remove attachment functions
- [ ] **Edit 4 — script.js**: Update `openTicketModal()` to render existing attachments and track `currentTicketId`
- [ ] **Edit 5 — style.css**: Add attachment grid, item, preview, remove-button, and uploader styles
- [ ] **Edit 6 — submit-ticket.html**: Add Attachments field to the Track Ticket result card + render logic in `displayTicketData()`

- [ ] **Test**: Admin attaches a file → verify it appears in admin modal and in branch Track Ticket view

## NOTE (limitations)
- Client-side unsigned uploads **cannot delete** files from Cloudinary (needs api_secret). Removing an attachment only removes it from the ticket doc.
- Cloudinary URLs are public.
- Must fill in `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET` in script.js after setup.

