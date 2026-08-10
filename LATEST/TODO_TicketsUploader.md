# TODO: Ticket Attachment Uploader — Neat UI + Progress Indicator

## Status: COMPLETE

## Goal
Make all ticket attachment upload areas neat and add a clear upload-progress
indicator (progress bar + % + spinner) so users never have to guess whether an
upload is happening.

## Upload Areas Updated (main.html)
1. Resolve Ticket modal (`#resolveModal`) — auto-upload dropzone
2. Revise & Resubmit modal (`#revisionModal`) — auto-upload dropzone
3. Approval Details modal (`#approvalDetailsModal`) — manual Upload button
4. Edit Approval Information modal (`#editApprovalModal`) — manual Upload button
5. Ticket Details modal (`#ticketModal`) — view-only attachments grid

## Steps Completed
- [x] main.html: Each uploader uses a consistent `.upload-widget` (dropzone +
      selected-file list + progress bar + % + spinner + status)
- [x] style.css: Styles present for `.upload-widget`, `.upload-dropzone`,
      `.upload-file-list`, `.upload-progress`, success/error states
- [x] script.js: `cloudinaryUpload()` uses XMLHttpRequest to report real upload
      percentage when an `onProgress` callback is provided
- [x] script.js: Shared helpers exist — `bindUploadDropzone`,
      `autoUploadSelectedFiles`, `resetAutoUpload`, `setUploadProgress`,
      `finishUploadProgress`, `validateUploadFiles`, `initAllUploadWidgets`
- [x] main.html: Added `data-auto-upload="true"` to the Resolve and Revision
      dropzones so they auto-upload selected files immediately, matching
      `bindUploadDropzone()` and the submit-handler merge logic
</content>

