
        (function() {
            var branchSelect = document.getElementById('branch');
            var ticketForm = document.getElementById('ticketForm');

            // REAL-TIME branch listener — syncs with main.html management page
            db.collection('branches').onSnapshot(function(snapshot) {
                var branches = [];
                snapshot.forEach(function(doc) {
                    branches.push({ id: doc.id, data: doc.data() });
                });
                branches.sort(function(a, b) {
                    return (a.data.branchName || a.id).localeCompare(b.data.branchName || b.id);
                });
                var currentValue = branchSelect.value;
                branchSelect.innerHTML = '<option value="">Select Branch</option>';
                branches.forEach(function(branch) {
                    var name = branch.data.branchName || branch.id;
                    var opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    branchSelect.appendChild(opt);
                });
                if (currentValue && branches.some(function(b) { return (b.data.branchName || b.id) === currentValue; })) {
                    branchSelect.value = currentValue;
                }
            }, function(err) {
                console.error('Branch listener error:', err);
                var fallback = ['Banawe','BF Homes','Eastwood','Fame','Gil Fernando','Hemady','Holy Spirit','MOA','Ortigas Center','Paseo','Promenade','SM Clark','SM Fairview','SM Marikina','SM Marilao','SM South Mall','SMDC Wind','SM East Ortigas','Sta. Rosa','SM Sucat','Tagaytay'];
                branchSelect.innerHTML = '<option value="">Select Branch</option>';
                fallback.forEach(function(name) {
                    var opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    branchSelect.appendChild(opt);
                });
            });

            // ---- TRACK TICKET STATUS MODAL (Two-Factor Verification) ----
            // SECURITY: Lookup REQUIRES an exact ticket-number match (document ID)
            // plus a matching contact/email. No partial or fuzzy matching is allowed.
            var trackModal = document.getElementById('trackModal');
            var trackBtn = document.getElementById('trackTicketBtn');
            var closeTrackBtn = document.getElementById('closeTrackModal');
            var trackInput = document.getElementById('trackTicketInput');
            var trackContactInput = document.getElementById('trackContactInput');
            var trackLookupBtn = document.getElementById('trackLookupBtn');
            var trackResult = document.getElementById('trackResult');
            var trackNotFound = document.getElementById('trackNotFound');
            var trackNotFoundMsg = document.getElementById('trackNotFoundMsg');
            var trackPendingApproval = document.getElementById('trackPendingApproval');
            var trackLoading = document.getElementById('trackLoading');
            var trackValidationError = document.getElementById('trackValidationError');
            var trackValidationMsg = document.getElementById('trackValidationMsg');
            // Request Additional Footage state/elements
            var trackFootageSection = document.getElementById('trackFootageSection');
            var trackRequestFootageBtn = document.getElementById('trackRequestFootageBtn');
            var trackFootageBox = document.getElementById('trackFootageBox');
            var trackFootageDetails = document.getElementById('trackFootageDetails');
            var trackSubmitFootage = document.getElementById('trackSubmitFootage');
            var trackCancelFootage = document.getElementById('trackCancelFootage');
            var trackFootageError = document.getElementById('trackFootageError');
            var trackFootageMsg = document.getElementById('trackFootageMsg');
            var trackFootageSuccess = document.getElementById('trackFootageSuccess');
            var trackFootageRequests = document.getElementById('trackFootageRequests');
            var currentTrackTicketId = null;
            var currentTrackData = null;


            function hideValidationError() {
                trackValidationError.style.display = 'none';
                trackInput.classList.remove('input-error');
                trackContactInput.classList.remove('input-error');
            }

            function openTrackModal() {
                trackModal.classList.add('active');
                trackInput.value = '';
                trackContactInput.value = '';
                trackResult.style.display = 'none';
                trackNotFound.style.display = 'none';
                trackPendingApproval.style.display = 'none';
                trackLoading.style.display = 'none';
                hideValidationError();
                // Reset the Request Additional Footage UI
                currentTrackTicketId = null;
                currentTrackData = null;
                if (trackFootageBox) trackFootageBox.style.display = 'none';
                if (trackFootageDetails) trackFootageDetails.value = '';
                if (trackFootageError) trackFootageError.style.display = 'none';
                if (trackFootageSuccess) trackFootageSuccess.style.display = 'none';
                setTimeout(function() { trackInput.focus(); }, 100);
            }

            function closeTrackModalFn() {
                trackModal.classList.remove('active');
            }

            if (trackBtn) trackBtn.addEventListener('click', openTrackModal);
            if (closeTrackBtn) closeTrackBtn.addEventListener('click', closeTrackModalFn);
            if (trackModal) {
                trackModal.addEventListener('click', function(e) {
                    if (e.target === trackModal) closeTrackModalFn();
                });
            }

            // ============================================================
            //  RESOLUTION NOTES HELPER
            // ============================================================
            // Shows only the resolution notes text (nested `resolution.notes`
            // plus legacy `resolutionNotes`). No resolved-by/at info, no images.
            function renderResolutionNotes(data) {
                var resolutionEl = document.getElementById("trackDisplayResolution");
                if (!resolutionEl) return;
                var resolution = data.resolution || {};
                var resNotes = resolution.notes || data.resolutionNotes || "";
                resolutionEl.textContent = resNotes || '\u2014';
            }


            function displayTicketData(data) {
                document.getElementById('trackDisplayId').textContent = data.ticketNumber || '\u2014';
                var statusEl = document.getElementById('trackDisplayStatus');
                var status = data.status || 'Pending';
                // Superadmin approval flow: a resolved ticket only counts as fully
                // "Resolved" after the superadmin approves it. While pending/rejected,
                // the operator sees "Pending Approval" so the status is consistent
                // with the admin dashboard and the Approvals tab.
                var approvalStatus = data.approvalStatus || 'pending';
                if (status === 'Resolved') {
                    status = approvalStatus === 'approved' ? 'Resolved' : 'Pending Approval';
                } else if (status === 'For Revision') {
                    status = 'For Revision';
                }
                var statusClass = status.toLowerCase().replace(/\s+/g, '-');
                statusEl.textContent = status;
                statusEl.className = 'track-status-badge ' + statusClass;
                // Rejection reason — shown only when the ticket was rejected
                // (reads top-level `rejectionReason`, legacy `approvalReason`,
                //  and the nested `rejection.reason` object written by the reject flow)
                var rejectionWrap = document.getElementById('trackRejectionWrap');
                var rejectionEl = document.getElementById('trackDisplayRejection');
                if (rejectionWrap && rejectionEl) {
                    var rejectionObj = (data.rejection && data.rejection.reason) ? data.rejection : null;
                    var reasonText = data.rejectionReason || data.approvalReason || (rejectionObj ? rejectionObj.reason : '') || '';
                    var rejectedBy = data.rejectedBy || (rejectionObj ? rejectionObj.rejectedBy : '') || '';
                    if ((approvalStatus === 'rejected' || status === 'For Revision') && reasonText) {
                        rejectionEl.textContent = reasonText +
                            (rejectedBy ? ' \u2014 rejected by ' + rejectedBy : '');
                        rejectionWrap.style.display = 'block';
                    } else {
                        rejectionEl.textContent = '';
                        rejectionWrap.style.display = 'none';
                    }
                }
document.getElementById('trackDisplayBranch').textContent = data.branch || '\u2014';
                document.getElementById('trackDisplayIncident').textContent = data.incident || '\u2014';
                document.getElementById('trackDisplayDescription').textContent = data.description || '\u2014';

                // ===== Resolution notes (approved resolutions only) =====
                // Rendered via the shared renderResolutionNotes() helper.
                renderResolutionNotes(data);
                // Render attachments inline (actual image/video previews)
                var attachmentsEl = document.getElementById('trackDisplayAttachments');
                var atts = data.attachments;
                if (atts && atts.length > 0) {
                    var html = '<div class="attachments-inline">';
                    for (var i = 0; i < atts.length; i++) {
                        var a = atts[i];
                        var url = a.secure_url;
                        var isImage = a.resource_type === 'image' || (a.format && /^(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(a.format));
                        if (isImage) {
                            html += '<img src="' + url + '" alt="Attachment" class="track-attachment-media" loading="lazy">';
                        } else if (a.resource_type === 'video') {
                            html += '<video src="' + url + '" controls class="track-attachment-media" preload="metadata"></video>';
                        } else {
                            html += '<a href="' + url + '" target="_blank" class="attachment-link" title="' + (a.public_id || 'Attachment') + '"><i class="fas fa-file"></i> Download File</a>';
                        }
                    }
                    html += '</div>';
                    attachmentsEl.innerHTML = html;
                } else {
                    attachmentsEl.innerHTML = '\u2014';
                }
                renderFootageRequests(data);
                trackResult.style.display = 'block';
            }

            function lookupTicket() {
                hideValidationError();

                var ticketNumber = trackInput.value.trim();
                var contactValue = trackContactInput.value.trim();

                // Validate both fields are filled
                if (!ticketNumber && !contactValue) {
                    trackValidationMsg.textContent = 'Please enter both a ticket number and your contact/email.';
                    trackValidationError.style.display = 'flex';
                    trackInput.classList.add('input-error');
                    trackContactInput.classList.add('input-error');
                    trackInput.focus();
                    return;
                }
                if (!ticketNumber) {
                    trackValidationMsg.textContent = 'Please enter your ticket number.';
                    trackValidationError.style.display = 'flex';
                    trackInput.classList.add('input-error');
                    trackInput.focus();
                    return;
                }
                if (!contactValue) {
                    trackValidationMsg.textContent = 'Please enter your contact number or email used during submission.';
                    trackValidationError.style.display = 'flex';
                    trackContactInput.classList.add('input-error');
                    trackContactInput.focus();
                    return;
                }

                trackResult.style.display = 'none';
                trackNotFound.style.display = 'none';
                trackPendingApproval.style.display = 'none';
                trackLoading.style.display = 'block';

                // Lookup ticket by exact document ID (ticket number).
                // SECURITY: this is an exact match only — no partial/fuzzy matching.
                db.collection('tickets').doc(ticketNumber).get().then(function(doc) {
                    trackLoading.style.display = 'none';

                    if (!doc.exists) {
                        trackNotFoundMsg.textContent = 'No ticket found with that number. Please check and try again.';
                        trackNotFound.style.display = 'block';
                        return;
                    }

                    var data = doc.data();
                    // Two-factor verification: check contact OR email match
                    var contactMatch = data.contact && data.contact.toLowerCase() === contactValue.toLowerCase();
                    var emailMatch = data.email && data.email.toLowerCase() === contactValue.toLowerCase();

                    if (contactMatch || emailMatch) {
            // ===== Visibility rule: PENDING tickets are NOT shown =====
                        // While a ticket is Pending, In Progress, awaiting
                        // superadmin approval, or sent back For Revision, the
                        // reporter only sees an informational notice. The full
                        // ticket details (status + resolution) are revealed only
                        // once the superadmin has APPROVED the resolution.
                        var approvalStatus = data.approvalStatus || 'pending';
                        var isApproved = approvalStatus === 'approved';
                        if (!isApproved) {
                            trackPendingApproval.style.display = 'block';
                            return;
                        }
                        // Ticket is approved by the superadmin — show details
                        currentTrackTicketId = doc.id;
                        currentTrackData = data;
                        displayTicketData(data);
                    } else {
                        // Credentials do not match
                        trackNotFoundMsg.textContent = 'Ticket number and contact/email combination do not match. Please verify your credentials.';
                        trackNotFound.style.display = 'block';
                    }
                }).catch(function(err) {
                    trackLoading.style.display = 'none';
                    console.error('Lookup error:', err);
                    trackNotFoundMsg.textContent = 'An error occurred while searching. Please try again.';
                    trackNotFound.style.display = 'block';
                });
            }

            if (trackLookupBtn) trackLookupBtn.addEventListener('click', lookupTicket);
            if (trackInput) {
                trackInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        trackContactInput.focus();
                    }
                });
            }
            if (trackContactInput) {
                trackContactInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        lookupTicket();
                    }
                });
            }

            // ============================================================
            //  REQUEST ADDITIONAL FOOTAGE (Reviewer -> Operator hand-off)
            //  Appends the request as a note onto the ticket's `comments`
            //  array (type: "footage_request") and resets the ticket state
            //  back to the operator: status "In Progress" + approval "pending".
            //  Self-contained (this page does not load script.js).
            // ============================================================
            function formatFootageNoteTimestamp(ts) {
                if (!ts) return '';
                var d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
                if (!d || isNaN(d.getTime())) return '';
                return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
            }
            function renderFootageRequests(data) {
                if (!trackFootageRequests) return;
                var notes = Array.isArray(data.comments) ? data.comments : [];
                notes = notes.filter(function(n) { return n && n.type === 'footage_request'; });
                trackFootageRequests.innerHTML = '';
                if (notes.length === 0) return;
                // Newest first
                for (var i = notes.length - 1; i >= 0; i--) {
                    var n = notes[i];
                    var noteEl = document.createElement('div');
                    noteEl.className = 'footage-note';
                    var textEl = document.createElement('div');
                    textEl.className = 'footage-note-text';
                    textEl.textContent = n.text || '';
                    noteEl.appendChild(textEl);
                    var metaEl = document.createElement('div');
                    metaEl.className = 'footage-note-meta';
                    var meta = 'Requested by ' + (n.requestedBy || 'anonymous');
                    var when = formatFootageNoteTimestamp(n.requestedAt);
                    if (when) meta += ' on ' + when;
                    metaEl.textContent = meta;
                    noteEl.appendChild(metaEl);
                    trackFootageRequests.appendChild(noteEl);
                }
            }
            function toggleFootageBox(show) {
                if (!trackFootageBox) return;
                trackFootageBox.style.display = show ? 'block' : 'none';
                if (!show) {
                    if (trackFootageError) trackFootageError.style.display = 'none';
                    if (trackFootageSuccess) trackFootageSuccess.style.display = 'none';
                }
                if (trackFootageDetails) trackFootageDetails.value = '';
            }
            function resetFootageForm() {
                if (trackFootageBox) trackFootageBox.style.display = 'none';
                if (trackFootageDetails) trackFootageDetails.value = '';
                if (trackFootageError) {
                    trackFootageError.style.display = 'none';
                    if (trackFootageMsg) trackFootageMsg.textContent = '';
                }
                if (trackFootageSuccess) trackFootageSuccess.style.display = 'none';
            }

            function submitFootageRequest() {
                if (!currentTrackTicketId) {
                    if (trackFootageMsg) trackFootageMsg.textContent = 'Please look up a ticket first.';
                    if (trackFootageError) trackFootageError.style.display = 'flex';
                    return;
                }
                var details = trackFootageDetails ? trackFootageDetails.value.trim() : '';
                if (!details) {
                    if (trackFootageMsg) trackFootageMsg.textContent = 'Please describe what footage is needed.';
                    if (trackFootageError) trackFootageError.style.display = 'flex';
                    if (trackFootageDetails) trackFootageDetails.focus();
                    return;
                }
                trackFootageError.style.display = 'none';
                trackSubmitFootage.disabled = true;
                var originalLabel = trackSubmitFootage.innerHTML;
                trackSubmitFootage.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
                var userEmail = (auth && auth.currentUser && auth.currentUser.email) || 'anonymous';
                var note = {
                    type: 'footage_request',
                    text: details,
                    requestedBy: userEmail,
                    requestedAt: new Date()
                };
                // Attach the request as a note (arrayUnion-append to `comments`) and
                // transition the ticket back to the operator ("In Progress").
                db.collection('tickets').doc(currentTrackTicketId).update({
                    status: 'In Progress',
                    approvalStatus: 'pending',
                    comments: firebase.firestore.FieldValue.arrayUnion(note),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(function() {
                    resetFootageForm();
                    if (trackFootageSuccess) trackFootageSuccess.style.display = 'flex';
                    // Optimistically re-render the note history (preserves existing notes).
                    if (trackFootageRequests) {
                        var existingComments = (currentTrackData && Array.isArray(currentTrackData.comments)) ? currentTrackData.comments : [];
                        renderFootageRequests(Object.assign({}, currentTrackData || {}, { comments: existingComments.concat([note]) }));
                    }
                    // Immediately reflect the new status badge.
                    var statusEl = document.getElementById('trackDisplayStatus');
                    if (statusEl) {
                        statusEl.textContent = 'In Progress';
                        statusEl.className = 'track-status-badge in-progress';
                    }
                }).catch(function(err) {
                    console.error('Footage request error:', err);
                    if (trackFootageMsg) trackFootageMsg.textContent = 'Failed to send the request. Please try again.';
                    if (trackFootageError) trackFootageError.style.display = 'flex';
                }).finally(function() {
                    if (trackSubmitFootage) {
                        trackSubmitFootage.disabled = false;
                        trackSubmitFootage.innerHTML = originalLabel;
                    }
                });
            }
            // Wire up the new tracking actions
            if (trackRequestFootageBtn) trackRequestFootageBtn.addEventListener('click', function() { toggleFootageBox(true); });
            if (trackCancelFootage) trackCancelFootage.addEventListener('click', function() { toggleFootageBox(false); });
            if (trackSubmitFootage) trackSubmitFootage.addEventListener('click', submitFootageRequest);

            // ---- SUCCESS MODAL (Ticket Number + Copy + Caution) ----
            var successModal = document.getElementById('successModal');
            var successTicketNumber = document.getElementById('successTicketNumber');
            var successCautionNote = document.getElementById('successCautionNote');
            var copyTicketBtn = document.getElementById('copyTicketBtn');
            var copyStatus = document.getElementById('copyStatus');
            var closeSuccessBtn = document.getElementById('closeSuccessModal');
            var doneSuccessBtn = document.getElementById('doneSuccessBtn');
            var lastGeneratedTicket = '';

            // Resolution notice shown in the success modal depends on ticket priority
            var SUCCESS_NOTE_HIGH = 'Please <span class="caution-highlight">screenshot or save</span> your ticket number. You will need it (along with your contact details/email) to view your ticket information later through the <em>"Track Ticket Status"</em> button. Tickets will be resolved within 24 hours and 3–5 days for unstable internet.';
            var SUCCESS_NOTE_LOW = 'Please <span class="caution-highlight">screenshot or save</span> your ticket number. You will need it (along with your contact details/email) to view your ticket information later through the <em>"Track Ticket Status"</em> button. Tickets will be resolved within 24–48 hours and 3–5 days for unstable internet.';

            function openSuccessModal(ticketNumber, priority) {
                // Show the resolution notice matching this ticket's priority
                if (successCautionNote) {
                    successCautionNote.innerHTML = (String(priority || '').toLowerCase() === 'high') ? SUCCESS_NOTE_HIGH : SUCCESS_NOTE_LOW;
                }
                lastGeneratedTicket = ticketNumber;
                if (successTicketNumber) successTicketNumber.textContent = ticketNumber;
                // Reset copy state each time the modal opens
                if (copyStatus) copyStatus.style.display = 'none';
                if (copyTicketBtn) {
                    copyTicketBtn.classList.remove('copied');
                    copyTicketBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                }
                if (successModal) successModal.classList.add('active');
                if (copyTicketBtn) setTimeout(function() { copyTicketBtn.focus(); }, 100);
            }

            function closeSuccessModalFn() {
                if (successModal) successModal.classList.remove('active');
                lastGeneratedTicket = '';
            }

            if (closeSuccessBtn) closeSuccessBtn.addEventListener('click', closeSuccessModalFn);
            if (doneSuccessBtn) doneSuccessBtn.addEventListener('click', closeSuccessModalFn);
            if (successModal) {
                successModal.addEventListener('click', function(e) {
                    if (e.target === successModal) closeSuccessModalFn();
                });
            }

            // Copy to clipboard with fallback for older phones/browsers
            function copyTicketNumber() {
                if (!lastGeneratedTicket) return;
                function onCopied() {
                    if (copyStatus) copyStatus.style.display = 'flex';
                    if (copyTicketBtn) {
                        copyTicketBtn.classList.add('copied');
                        copyTicketBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
                    }
                    setTimeout(function() {
                        if (copyStatus) copyStatus.style.display = 'none';
                        if (copyTicketBtn) {
                            copyTicketBtn.classList.remove('copied');
                            copyTicketBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                        }
                    }, 2500);
                }
                // Modern API
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(lastGeneratedTicket).then(onCopied).catch(function() {
                        fallbackCopy(lastGeneratedTicket, onCopied);
                    });
                } else if (window.clipboardData && window.clipboardData.setData) {
                    // Old IE / some Android WebViews
                    window.clipboardData.setData('Text', lastGeneratedTicket);
                    onCopied();
                } else {
                    fallbackCopy(lastGeneratedTicket, onCopied);
                }
            }

            function fallbackCopy(text, done) {
                var textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.top = '-1000px';
                textarea.style.left = '-1000px';
                document.body.appendChild(textarea);
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);
                var ok = false;
                try {
                    ok = document.execCommand('copy');
                } catch (err) { ok = false; }
                document.body.removeChild(textarea);
                if (ok && done) done();
            }

            if (copyTicketBtn) copyTicketBtn.addEventListener('click', copyTicketNumber);

            // FORM SUBMIT
            if (ticketForm) {
                ticketForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    var branch = document.getElementById('branch').value;
                    var priority = document.getElementById('priority').value;
                    if (!branch) { alert('Please select a branch.'); return; }

                    var branchCodes = {"Banawe":"bnw","BF Homes":"bf","Eastwood":"estw","Fame":"fame","Gil Fernando":"gilf","Hemady":"hmdy","Holy Spirit":"hspi","MOA":"moa","Ortigas Center":"ortc","Paseo":"pseo","Promenade":"prme","SM Clark":"smc","SM Fairview":"smf","SM Marikina":"smmk","SM Marilao":"smml","SM South Mall":"smsm","SMDC Wind":"smwd","SM East Ortigas":"smeo","Sta. Rosa":"str","SM Sucat":"smsu","Tagaytay":"tag"};
                    var prefix = branchCodes[branch] || branch.toLowerCase().substring(0, 3);
                    var generatedTicketID = '';

                    db.collection('tickets').get().then(function(snapshot) {
                        var count = 1;
                        snapshot.forEach(function(ticket) {
                            if (ticket.id.startsWith(prefix + "-tix")) count++;
                        });
                        var number = String(count).padStart(3, "0");
                        var ticketID = prefix + "-tix" + number;
                        generatedTicketID = ticketID;
                        var ticketData = {
                            ticketNumber: ticketID,
                            branch: branch,
                            name: document.getElementById('name').value,
                            position: document.getElementById('position').value,
                            contact: document.getElementById('contact').value,
                            email: document.getElementById('email').value,
                            datetime: document.getElementById('datetime').value,
                            location: document.getElementById('location').value,
                            incident: document.getElementById('incident').value,
                            description: document.getElementById('description').value,
                            priority: priority || 'Low',
                            status: 'Pending',
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        return db.collection('tickets').doc(ticketID).set(ticketData);
                    }).then(function() {
                        // Show the success modal with the generated ticket number
                        if (generatedTicketID) {
                            openSuccessModal(generatedTicketID, priority);
                        }
                        ticketForm.reset();
                    }).catch(function(err) {
                        console.error('Submit error:', err);
                        alert('Failed to submit ticket. Try again.');
                    });
                });
            }
        })();
    