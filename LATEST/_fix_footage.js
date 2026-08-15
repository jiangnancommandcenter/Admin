// Surgical cleanup for submit-ticket.html footprint additions.
// Content-anchored + assertion-guarded. Creates a .bak first.
const fs = require('fs');
const p = 'c:/Users/Admin/Documents/Implement/submit-ticket.html';
fs.copyFileSync(p, p + '.bak');
console.log('[backup] OK -> ' + p + '.bak');
let L = fs.readFileSync(p, 'utf8').split('\n');          // keeps trailing \r on CRLF lines
const cr = (l) => (l.endsWith('\r') ? '\r' : '');
function core(l) { return l.replace(/\r$/, '').replace(/\s+$/, ''); } // strip trailing CR + trailing spaces
const cnt = (re) => { let n = 0; for (const l of L) if (re.test(core(l))) n++; return n; };
console.log('[before] lines=' + L.length,
  '| trackValidationMsgVar=' + cnt(/^            var trackValidationMsg =/),
  '| hideValidationErrorCall=' + cnt(/hideValidationError\(\);$/),
  '| setTimeoutFocus=' + cnt(/^                setTimeout\(function\(\) \{ trackInput\.focus\(\); \}, 100\);$/),
  '| trackResultShow=' + cnt(/^                trackResult\.style\.display = 'block';$/),
  '| reqHeader=' + cnt(/^            \/\/  REQUEST ADDITIONAL FOOTAGE \(Reviewer -> Operator hand-off\)$/),
  '| submitDecl24=' + cnt(/^                        function submitFootageRequest\(\) \{$/),
  '| eqHeader24=' + cnt(/^                        \/\/ ===/));
// ---- PASS HTML: re-indent trackFootageSection block to 28sp base ----
{
  let idx = -1;
  for (let i = 0; i < L.length; i++) if (L[i].includes('id="trackFootageSection"')) { idx = i; break; }
  if (idx === -1) { console.error('HTML: open not found'); process.exit(1); }
  if (!/^ {20,}<div class="track-field track-field-full" id="trackFootageSection">$/.test(core(L[idx]))) { console.error('HTML: open: ' + JSON.stringify(core(L[idx]))); process.exit(1); }
  if (core(L[idx + 24]).replace(/^\s+/, '') !== '</div>') { console.error('HTML: close: ' + JSON.stringify(core(L[idx + 24]))); process.exit(1); }
  const clean = [
    '                            <div class="track-field track-field-full" id="trackFootageSection">',
    '                                <div class="track-footage-header">',
    '                                    <button type="button" class="btn btn-secondary btn-sm" id="trackRequestFootageBtn">',
    '                                        <i class="fas fa-video"></i> Request Additional Footage',
    '                                    </button>',
    '                                </div>',
    '                                <div id="trackFootageBox">',
    '                                    <label for="trackFootageDetails">Footage Details</label>',
    '                                    <textarea id="trackFootageDetails" class="track-input" rows="3"',
    '                                        placeholder="Describe the specific footage required (e.g. camera angle, time range, location)..."></textarea>',
    '                                    <div class="track-footage-actions">',
    '                                        <button type="button" class="btn btn-secondary btn-sm" id="trackCancelFootage">Cancel</button>',
    '                                        <button type="button" class="btn btn-primary btn-sm" id="trackSubmitFootage"><i class="fas fa-paper-plane"></i> Submit Request</button>',
    '                                    </div>',
    '                                </div>',
    '                                <div id="trackFootageError" class="track-validation-error" style="display:none;">',
    '                                    <i class="fas fa-exclamation-triangle"></i>',
    '                                    <span id="trackFootageMsg">Please describe what footage is needed.</span>',
    '                                </div>',
    '                                <div id="trackFootageSuccess" class="track-success-notice" style="display:none;">',
    '                                    <i class="fas fa-check-circle"></i>',
    '                                    <span id="trackFootageSuccessMsg">Your footage request has been sent to the operator.</span>',
    '                                </div>',
    '                                <div id="trackFootageRequests" class="track-footage-history"></div>',
    '                            </div>'
  ].map(s => s + '\r');
  if (clean.length !== 25) { console.error('HTML: clean not 25 lines'); process.exit(1); }
  L.splice(idx, 25, ...clean);
  console.log('[html] trackFootageSection re-indented (25 lines, 28sp base)');
}
// ---- PASS D: remove COPY 2 of the JS functions block ----
{
  const req = '            //  REQUEST ADDITIONAL FOOTAGE (Reviewer -> Operator hand-off)';
  const comment = '            // ---- SUCCESS MODAL (Ticket Number + Copy + Caution) ----';
  let headers = [], commentIdx = -1;
  for (let i = 0; i < L.length; i++) { if (core(L[i]) === req) headers.push(i); if (core(L[i]) === comment) commentIdx = i; }
  if (headers.length !== 2) { console.error('D: headers=' + headers.length + ' want 2'); process.exit(1); }
  if (commentIdx === -1) { console.error('D: SUCCESS MODAL comment not found'); process.exit(1); }
  const removeStart = headers[1] - 1; // copy2's `// ===` header line
  const removeEnd = commentIdx - 1;   // blank line before the comment
  if (!/^ {24}\/\/ ===/.test(L[removeStart])) { console.error('D: removeStart bad: ' + JSON.stringify(core(L[removeStart]))); process.exit(1); }
  if (core(L[removeEnd]) !== '') { console.error('D: removeEnd not blank: ' + JSON.stringify(core(L[removeEnd]))); process.exit(1); }
  const block = L.slice(removeStart, removeEnd + 1).join('');
  if (!block.includes('function submitFootageRequest() {')) { console.error('D: copy2 missing submitFootageRequest'); process.exit(1); }
  if (!block.includes('// Wire up the new tracking actions')) { console.error('D: copy2 missing wiring'); process.exit(1); }
  L.splice(removeStart, removeEnd - removeStart + 1);
  console.log('[D] removed COPY 2 of functions block: lines ' + (removeStart + 1) + '..' + (removeEnd + 1) + ' (' + (removeEnd - removeStart + 1) + ' lines)');
}
// ---- PASS 2: dedup var trackValidationMsg (2nd of consecutive) ----
{
  const target = "            var trackValidationMsg = document.getElementById('trackValidationMsg');";
  const out = []; let skip = 0;
  for (let i = 0; i < L.length; i++) {
    if (core(L[i]) === target && i + 1 < L.length && core(L[i + 1]) === target) { out.push(L[i]); i++; skip++; }
    else out.push(L[i]);
  }
  console.log('[pass2] removed ' + skip + ' duplicate trackValidationMsg var line(s)'); L = out;
}
// ---- PASS 3: dedup hideValidationError() call (2nd of consecutive) ----
{
  const target = '                hideValidationError();';
  const out = []; let skip = 0;
  for (let i = 0; i < L.length; i++) {
    if (core(L[i]) === target && i + 1 < L.length && core(L[i + 1]) === target) { out.push(L[i]); i++; skip++; }
    else out.push(L[i]);
  }
  console.log('[pass3] removed ' + skip + ' duplicate hideValidationError call(s)'); L = out;
}
// ---- PASS 4: collapse [setTimeout][blank][setTimeout] -> [setTimeout] ----
{
  const t = '                setTimeout(function() { trackInput.focus(); }, 100);';
  const out = []; let skip = 0;
  for (let i = 0; i < L.length; i++) {
    if (core(L[i]) === t && i + 1 < L.length && core(L[i + 1]) === '' && i + 2 < L.length && core(L[i + 2]) === t) {
      out.push(L[i]); i += 2; skip++;
    } else out.push(L[i]);
  }
  console.log('[pass4] collapsed ' + skip + ' duplicate setTimeout pair(s)'); L = out;
}
// ---- PASS 5: collapse [trackResult display][blank][trackResult display] ----
{
  const t = "                trackResult.style.display = 'block';";
  const out = []; let skip = 0;
  for (let i = 0; i < L.length; i++) {
    if (core(L[i]) === t && i + 1 < L.length && core(L[i + 1]) === '' && i + 2 < L.length && core(L[i + 2]) === t) {
      out.push(L[i]); i += 2; skip++;
    } else out.push(L[i]);
  }
  console.log('[pass5] collapsed ' + skip + ' duplicate trackResult.display pair(s)'); L = out;
}
// ---- PASS 6: fix currentTrackTicketId indent (48sp -> 24sp) ----
{
  const out = []; let fixed = 0;
  for (let i = 0; i < L.length; i++) {
    const c = core(L[i]);
    if (/^ {40,}currentTrackTicketId = doc\.id;$/.test(c)) { out.push('                        currentTrackTicketId = doc.id;' + cr(L[i])); fixed++; }
    else out.push(L[i]);
  }
  console.log('[pass6] fixed ' + fixed + ' over-indented currentTrackTicketId line(s) (48sp->24sp)'); L = out;
}
// ---- PASS 7: re-indent copy1 `//===` header + submitFootageRequest decl (24sp -> 12sp) ----
{
  const out = []; let fixed = 0;
  for (let i = 0; i < L.length; i++) {
    const c = core(L[i]);
    if (/^ {24}\/\/ ===/.test(c)) { out.push('            ' + c.replace(/^ {24}/, '') + cr(L[i])); fixed++; }
    else if (/^ {24}function submitFootageRequest\(\) \{$/.test(c)) { out.push('            function submitFootageRequest() {' + cr(L[i])); fixed++; }
    else out.push(L[i]);
  }
  console.log('[pass7] re-indented ' + fixed + ' over-indented JS line(s) (24sp->12sp)'); L = out;
}
fs.writeFileSync(p, L.join('\n'));
console.log('[write] DONE. new line count: ' + L.length);
const c2 = (re) => { let n = 0; for (const l of L) if (re.test(core(l))) n++; return n; };
console.log('[after] lines=' + L.length,
  '| trackValidationMsgVar=' + c2(/^            var trackValidationMsg =/),
  '| hideValidationErrorCall=' + c2(/hideValidationError\(\);$/),
  '| setTimeoutFocus=' + c2(/^                setTimeout\(function\(\) \{ trackInput\.focus\(\); \}, 100\);$/),
  '| trackResultShow=' + c2(/^                trackResult\.style\.display = 'block';$/),
  '| reqHeader=' + c2(/^            \/\/  REQUEST ADDITIONAL FOOTAGE \(Reviewer -> Operator hand-off\)$/),
  '| submitDecl12=' + c2(/^            function submitFootageRequest\(\) \{$/),
  '| submitDecl24=' + c2(/^ {24}function submitFootageRequest\(\) \{$/),
  '| eqHeader24=' + c2(/^                        \/\/ ===/),
  '| footageIdVar48=' + c2(/^ {40,}currentTrackTicketId = doc\.id;$/));