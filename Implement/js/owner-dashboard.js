// Owner dashboard - Firebase-connected and role-aware
const $owner = (id) => document.getElementById(id);

const ownerNavItems = Array.from(document.querySelectorAll('#ownerSidebarNav .nav-item'));
const ownerTabContents = Array.from(document.querySelectorAll('#ownerMainContent .tab-content'));
const ownerPageTitle = $owner('ownerPageTitle');
const ownerPageSubtitle = $owner('ownerPageSubtitle');
const ownerUserEmail = $owner('ownerUserEmail');
const ownerUserRoleBadge = $owner('ownerUserRoleBadge');
const ownerBranchFilter = $owner('ownerBranchFilter');
const ownerReportBranchFilter = $owner('ownerReportBranchFilter');
const ownerReportSearch = $owner('ownerReportSearch');
const ownerRefreshReports = $owner('ownerRefreshReports');
const ownerReportsBody = $owner('ownerReportsBody');
const ownerReportPagination = $owner('ownerReportPagination');
const ownerBranchList = $owner('ownerBranchList');
const ownerPermSummary = $owner('ownerPermSummary');
const ownerLogoutBtn = $owner('ownerLogoutBtn');
const ownerReportModal = $owner('ownerReportModal');
const ownerReportModalBody = $owner('ownerReportModalBody');
const closeOwnerReportModal = $owner('closeOwnerReportModal');
const ownerReportDetailsStatus = $owner('ownerReportDetailsStatus');

const kpiMonthlyReports = $owner('totalMonthlyReports');
const kpiAssignedReports = $owner('totalAssignedReports');
const kpiActiveBranches = $owner('totalActiveBranches');
const kpiAccessLevel = $owner('accessLevelValue');

let ownerAllBranches = [];
let ownerAssignedBranches = [];
let activeUserRole = 'viewer';
let activeUserPermissions = {
  branches: [],
  permissions: { viewOnly: false, canEdit: false, canDownload: false }
};
let activeUserIsSuperAdmin = false;

// One-shot flag: owner refresh state (saved tab/modal) is restored exactly once
// per page load so a later auth callback (e.g. ID-token refresh) can never yank
// the user off the view they are currently using.
let ownerStateRestored = false;

// ===== Flash-free restore =====
// Runs synchronously during parsing — before the first paint — so a refresh
// re-opens the saved tab (Overview / Reports) with no visible default-then-jump.
// The async auth observer re-checks the actual role afterwards.
(function preRestoreOwnerTab() {
    try {
        if (!window.RefreshState) return;
        const saved = window.RefreshState.restore('owner') || {};
        const tabId = saved.tab;
        if (tabId !== 'overview' && tabId !== 'reports') return;

        ownerNavItems.forEach((btn) => { btn.classList.toggle('active', btn.dataset.tab === tabId); });
        ownerTabContents.forEach((section) => { section.classList.toggle('active', section.id === `tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`); });
    } catch (e) { /* ignore */ }
})();

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  } else {
    console.log(message);
  }
}

function setActiveUser(permissions, role = 'viewer') {
  activeUserPermissions = permissions || {
    branches: [],
    permissions: { viewOnly: false, canEdit: false, canDownload: false }
  };

  const normalizedRole = String(role || 'viewer').toLowerCase();
  activeUserRole = normalizedRole;
  activeUserIsSuperAdmin = normalizedRole === 'superadmin';

  const accessLevel = normalizedRole === 'superadmin'
    ? 'Superadmin'
    : normalizedRole === 'owner'
      ? 'Owner'
      : (activeUserPermissions.permissions && activeUserPermissions.permissions.canEdit ? 'Editor' : 'Viewer');

  if (ownerUserRoleBadge) {
    ownerUserRoleBadge.textContent = accessLevel;
    ownerUserRoleBadge.className = 'role-badge ' + (
      normalizedRole === 'superadmin'
        ? 'superadmin'
        : normalizedRole === 'owner'
          ? 'owner'
          : (activeUserPermissions.permissions?.canEdit ? 'editor' : 'viewer')
    );
  }

  if (kpiAccessLevel) {
    kpiAccessLevel.textContent = accessLevel;
  }

  applyAssignedBranches();
}

function switchOwnerTab(tabId) {
  ownerNavItems.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  ownerTabContents.forEach((section) => {
    section.classList.toggle('active', section.id === `tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
  });
  try { if (window.RefreshState) window.RefreshState.captureTab('owner', tabId); } catch (e) { /* ignore */ }
}

// ===== Refresh resilience: persist the Reports-tab filters (branch + search)
//       so F5 keeps the owner on the exact filtered view they were using. =====
function saveOwnerReportFilters() {
  try {
    if (!window.RefreshState) return;
    window.RefreshState.capture('owner', {
      filterBranch: ownerReportBranchFilter ? ownerReportBranchFilter.value : '',
      filterSearch: ownerReportSearch ? ownerReportSearch.value.trim() : ''
    });
  } catch (e) { /* ignore */ }
}

function applyOwnerReportFilters(saved) {
  if (!saved) return;
  try {
    // Only re-apply the saved branch if it is still one of the owner's options
    // (a permission change could otherwise point at a no-longer-assigned branch).
    if (saved.filterBranch && ownerReportBranchFilter &&
        Array.from(ownerReportBranchFilter.options).some((o) => o.value === saved.filterBranch)) {
      ownerReportBranchFilter.value = saved.filterBranch;
    }
    if (saved.filterSearch && ownerReportSearch) {
      ownerReportSearch.value = saved.filterSearch;
    }
    loadOwnerReports();
  } catch (e) { /* ignore */ }
}

function populateBranchDropdowns() {
  const assignedOptions = ownerAssignedBranches
    .map((branch) => `<option value="${escapeHTML(branch)}">${escapeHTML(branch)}</option>`)
    .join('');

  const html = `<option value="">All Branches</option>${assignedOptions}`;

  if (ownerBranchFilter) ownerBranchFilter.innerHTML = html;
  if (ownerReportBranchFilter) ownerReportBranchFilter.innerHTML = html;
}

function renderBranchAccessList() {
  if (!ownerBranchList) return;

  if (!ownerAssignedBranches.length) {
    ownerBranchList.innerHTML = '<div class="empty-state"><i class="fas fa-map-pin"></i><p>No branch access assigned yet.</p></div>';
    return;
  }

  ownerBranchList.innerHTML = ownerAssignedBranches
    .map((branch) => `
      <div class="quick-status-item">
        <span>${escapeHTML(branch)}</span>
        <span class="status-badge online">Assigned</span>
      </div>
    `)
    .join('');
}

function renderPermissionSummary() {
  if (!ownerPermSummary) return;

  const p = activeUserPermissions.permissions || {};
  const chips = [
    p.viewOnly ? '<span class="perm-chip">View Only</span>' : '',
    p.canEdit ? '<span class="perm-chip perm-chip-edit">Can Edit</span>' : '',
    p.canDownload ? '<span class="perm-chip perm-chip-download">Can Download</span>' : ''
  ].filter(Boolean);

  ownerPermSummary.innerHTML = chips.length ? chips.join('') : '<span class="perm-chip">No extra permissions</span>';
}

function renderKpiCards() {
  const accessLabel = activeUserRole === 'superadmin'
    ? 'Superadmin'
    : activeUserRole === 'owner'
      ? 'Owner'
      : (activeUserPermissions.permissions && activeUserPermissions.permissions.canEdit ? 'Editor' : 'Viewer');

  if (kpiMonthlyReports) kpiMonthlyReports.textContent = '0';
  if (kpiAssignedReports) kpiAssignedReports.textContent = String(ownerAssignedBranches.length);
  if (kpiActiveBranches) kpiActiveBranches.textContent = String(ownerAssignedBranches.length);
  if (kpiAccessLevel) kpiAccessLevel.textContent = accessLabel;
}

function applyAssignedBranches() {
  if (!ownerAllBranches.length) {
    ownerAssignedBranches = [];
  } else if (activeUserIsSuperAdmin) {
    ownerAssignedBranches = [...ownerAllBranches];
  } else {
    ownerAssignedBranches = ownerAllBranches.filter((branch) => {
      const branchName = String(branch).trim();
      return activeUserPermissions.branches.includes(branchName);
    });
  }

  populateBranchDropdowns();
  renderBranchAccessList();
  renderPermissionSummary();
  renderKpiCards();
  loadOwnerReports();
}

async function loadBranches() {
  try {
    if (!window.firestoreService || typeof window.firestoreService.getBranches !== 'function') {
      throw new Error('firestoreService.getBranches is not available');
    }

    const branches = await window.firestoreService.getBranches();
    ownerAllBranches = branches
      .map((b) => b.branchName || b.id || '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    applyAssignedBranches();
  } catch (error) {
    console.error('Failed to load branches:', error);
    ownerAllBranches = [];
    ownerAssignedBranches = [];
    populateBranchDropdowns();
    renderBranchAccessList();
    renderPermissionSummary();
  }
}

async function loadActiveUserPermissions(user) {
  if (!user || !user.email) return;

  if (ownerUserEmail) ownerUserEmail.textContent = user.email;

  try {
    const emailKey = window.normalizeUserEmail(user.email);
    const userDoc = await db.collection('users').doc(emailKey).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const role = String((userData && userData.role) || 'owner').toLowerCase();
    const permissions = userData ? {
      branches: Array.isArray(userData.branches) ? userData.branches : [],
      permissions: userData.permissions || { viewOnly: false, canEdit: false, canDownload: false }
    } : {
      branches: [],
      permissions: { viewOnly: false, canEdit: false, canDownload: false }
    };

    setActiveUser(permissions, role);
  } catch (error) {
    console.error('Failed to load user permissions:', error);
    setActiveUser(activeUserPermissions, false);
  }
}

function formatDate(dateValue) {
  if (!dateValue) return '—';
  if (dateValue.toDate) {
    return dateValue.toDate().toLocaleString();
  }
  return new Date(dateValue).toLocaleString();
}

function normalizeTicketReport(ticket) {
  const report = ticket || {};
  const branchName = String(report.branch || report.branchName || '—').trim() || '—';
  const authorName = String(report.author || report.reporter || report.name || 'Unknown').trim() || 'Unknown';
  const title = String(report.title || report.reportName || report.incident || 'Untitled Report').trim() || 'Untitled Report';
  const submittedAt = report.createdAt || report.dateCreated || report.submittedAt || report.datetime || report.dateTime || null;

  return {
    ...report,
    branchName,
    authorName,
    title,
    submittedAt,
    ticketNumber: report.ticketNumber || report.id || 'N/A'
  };
}

async function loadOwnerReports() {
  try {
    if (!ownerReportsBody) return;

    if (!db || typeof db.collection !== 'function') {
      ownerReportsBody.innerHTML = '<tr><td colspan="5" class="empty-state"><em>Firebase is unavailable.</em></td></tr>';
      return;
    }

    const selectedBranch = ownerReportBranchFilter ? ownerReportBranchFilter.value : '';
    const searchText = ownerReportSearch ? ownerReportSearch.value.trim().toLowerCase() : '';
    const snapshot = await db.collection('tickets').get();
    let reports = snapshot.docs
      .map((doc) => normalizeTicketReport({ id: doc.id, ...doc.data() }));

    // Filter: only show tickets that have been approved by superadmin
    // Approved tickets have: status === 'Resolved' AND approvalStatus === 'approved'
    reports = reports.filter((report) => {
      const approvalStatus = report.approvalStatus || 'pending';
      const status = report.status || 'Pending';
      // Only show approved/resolved tickets
      return approvalStatus === 'approved' && status === 'Resolved';
    });

    const allowedBranches = activeUserIsSuperAdmin ? ownerAllBranches : ownerAssignedBranches;
    reports = reports.filter((report) => {
      const branch = String(report.branch || report.branchName || '').trim();
      return allowedBranches.includes(branch);
    });

    if (selectedBranch) {
      reports = reports.filter((report) => (report.branch || report.branchName || '') === selectedBranch);
    }

    if (searchText) {
      reports = reports.filter((report) => {
        const haystack = [
          report.ticketNumber,
          report.title,
          report.incident,
          report.authorName,
          report.author,
          report.reporter,
          report.name,
          report.branch,
          report.branchName,
          report.description,
          report.location
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(searchText);
      });
    }

    reports.sort((a, b) => {
      const aTime = a.submittedAt && a.submittedAt.toDate ? a.submittedAt.toDate().getTime() : new Date(a.submittedAt || 0).getTime();
      const bTime = b.submittedAt && b.submittedAt.toDate ? b.submittedAt.toDate().getTime() : new Date(b.submittedAt || 0).getTime();
      return bTime - aTime;
    });

    if (!reports.length) {
      ownerReportsBody.innerHTML = '<tr><td colspan="5" class="empty-state"><em>No approved reports found for your assigned branches.</em></td></tr>';
      return;
    }

    ownerReportsBody.innerHTML = reports.map((report) => `
      <tr>
        <td>${escapeHTML(report.title)}</td>
        <td>${escapeHTML(report.authorName)}</td>
        <td>${escapeHTML(formatDate(report.submittedAt))}</td>
        <td>${escapeHTML(report.branchName)}</td>
        <td>
          <div class="action-stack compact">
            <button type="button" class="btn btn-icon action-btn view" data-tooltip="View" onclick="window.openOwnerReport('${escapeHTML(report.id)}')">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    if (ownerReportPagination) {
      ownerReportPagination.innerHTML = `<span class="page-info">${reports.length} approved report(s)</span>`;
    }
  } catch (error) {
    console.error('Failed to load owner reports:', error);
    if (ownerReportsBody) {
      ownerReportsBody.innerHTML = '<tr><td colspan="5" class="empty-state"><em>Unable to load reports.</em></td></tr>';
    }
  }
}

/**
 * Split a ticket's files into the requester's original attachments and the
 * operator's added footage so the two never blend into one list:
 *  - requester files: `requesterAttachments` (written when the ticket is created)
 *  - operator footage: `resolution.operatorFootage` / `resolvedAdditionalFootage`
 *  - legacy tickets that only carry a single merged list show it under the
 *    requester so nothing is hidden from the viewer.
 */
function splitOwnerAttachments(rawData) {
  const resolution = (rawData && rawData.resolution) || {};
  let merged = Array.isArray(resolution.attachments) ? resolution.attachments.slice() : [];
  if (merged.length === 0 && rawData && Array.isArray(rawData.attachments)) {
    merged = rawData.attachments.slice();
  }
  if (merged.length === 0 && rawData && rawData.resolutionAttachmentUrl) {
    merged = [{
      secure_url: rawData.resolutionAttachmentUrl,
      name: rawData.resolutionAttachmentName || 'Resolution attachment',
      resource_type: 'raw',
      format: ''
    }];
  }

  let footage = Array.isArray(resolution.operatorFootage) ? resolution.operatorFootage.slice() : [];
  if (footage.length === 0 && rawData && Array.isArray(rawData.resolvedAdditionalFootage)) {
    footage = rawData.resolvedAdditionalFootage.slice();
  }

  const requester = (rawData && Array.isArray(rawData.requesterAttachments)) ? rawData.requesterAttachments.slice() : null;
  const keyOf = (a) => (a && (a.public_id || a.secure_url)) || '';
  const excludeKeys = (list) => new Set((list || []).map(keyOf).filter(Boolean));

  if (footage.length > 0) {
    const keys = excludeKeys(footage);
    return { requester: merged.filter(a => !keys.has(keyOf(a))), operator: footage };
  }
  if (requester && requester.length > 0) {
    const keys = excludeKeys(requester);
    return { requester: requester, operator: merged.filter(a => !keys.has(keyOf(a))) };
  }
  return { requester: merged, operator: [] };
}

window.openOwnerReport = function(reportId) {
  if (!reportId || !db) return;
  try { if (window.RefreshState) window.RefreshState.capture('owner', { tab: 'reports', modal: 'report', id: reportId }); } catch (e) { /* ignore */ }

  db.collection('tickets').doc(reportId).get().then((snap) => {
    if (!snap.exists) return;

    // Get full ticket data including attachments
    const rawData = snap.data();
    const data = normalizeTicketReport(rawData);

    // Helper to get attachment icon color based on format
    function getAttachmentColor(format) {
      const lowerForm = (format || '').toLowerCase();
      if (lowerForm.includes('mp4') || lowerForm.includes('mov') || lowerForm.includes('avi') || lowerForm.includes('webm')) return '#e53935';
      if (lowerForm.includes('jpg') || lowerForm.includes('jpeg') || lowerForm.includes('png') || lowerForm.includes('gif') || lowerForm.includes('webp')) return '#388e3c';
      return '#6c757d';
    }

    // Helper to render one attachment as a clean file row (icon + name + size).
    // No large preview boxes — entries without a usable link are skipped so
    // empty clickable grey boxes can never appear.
    function buildAttachmentRow(att) {
      const url = att.secure_url || att.url || '';
      if (!url) return '';
      const name = att.name || 'Attachment';
      const resourceType = att.resource_type || '';
      const format = String(att.format || '').toLowerCase();
      const color = getAttachmentColor(format);

      // Images get a visible inline preview (not just a clickable chip).
      if (resourceType === 'image') {
        return `
          <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" class="owner-attachment-image" title="Click to view full size: ${escapeHTML(name)}">
            <img src="${escapeHTML(url)}" alt="${escapeHTML(name)}" loading="lazy"
                 onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';">
            <div class="owner-attachment-file-icon" style="display:none;"><i class="fas fa-file-image" style="color:${color}"></i></div>
            <span class="owner-attachment-image-name"><i class="fas fa-expand-alt"></i> ${escapeHTML(name)}</span>
          </a>
        `;
      }

      let icon = 'fa-file';
      if (resourceType === 'video') icon = 'fa-file-video';
      else if (format === 'pdf') icon = 'fa-file-pdf';
      else if (/^(xlsx?|csv)$/.test(format)) icon = 'fa-file-excel';
      else if (/^(zip|rar|7z)$/.test(format)) icon = 'fa-file-archive';

      const sizeText = att.bytes
        ? (att.bytes < 1024
            ? att.bytes + ' B'
            : att.bytes < 1024 * 1024
              ? (att.bytes / 1024).toFixed(1) + ' KB'
              : (att.bytes / (1024 * 1024)).toFixed(2) + ' MB')
        : '';

      return `
        <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" class="owner-attachment-row" title="${escapeHTML(name)}">
          <i class="fas ${icon}" style="color:${color}"></i>
          <span class="owner-attachment-name">${escapeHTML(name)}</span>
          ${sizeText ? `<span class="owner-attachment-size">${escapeHTML(sizeText)}</span>` : ''}
          <i class="fas fa-external-link-alt"></i>
        </a>
      `;
    }

    // Split the ticket's files into requester attachments vs operator footage
    const attachments = splitOwnerAttachments(rawData);

    // Status badge in the modal header
    const statusText = String(data.status || 'Resolved');
    const statusClass = statusText.toLowerCase().replace(/\s+/g, '-');
    if (ownerReportDetailsStatus) {
      ownerReportDetailsStatus.textContent = statusText;
      ownerReportDetailsStatus.className = 'status-badge ' + statusClass;
      ownerReportDetailsStatus.style.display = 'inline-flex';
    }

    const resolution = (rawData && rawData.resolution) || {};
    // NOTE: the operator's identity (resolvedBy) is intentionally NOT shown to
    // owners here — their name/email is private. Only the timestamp + notes are
    // displayed in the Operator's Resolution card.
    const resolvedAt = formatDate(resolution.resolvedAt || rawData.resolvedAt || null);
    const resNotes = resolution.notes || rawData.resolutionNotes || 'No resolution notes provided.';

    // Render the file lists, skipping any broken entries (no link)
    const requesterFiles = attachments.requester.filter(a => a && (a.secure_url || a.url));
    const operatorFiles = attachments.operator.filter(a => a && (a.secure_url || a.url));
    const requesterAttHtml = requesterFiles.length > 0
      ? requesterFiles.map(buildAttachmentRow).join('')
      : '<p class="review-empty-files">No files available.</p>';
    const operatorAttHtml = operatorFiles.length > 0
      ? operatorFiles.map(buildAttachmentRow).join('')
      : '<p class="review-empty-files">No files available.</p>';

    const html = `
      <!-- ===== SECTION 1: REQUESTER'S ORIGINAL REQUEST (collapsible, on top) ===== -->
      <details class="review-collapse">
        <summary>
          <span class="review-collapse-title"><i class="fas fa-user-tie"></i> Requester's Original Request</span>
          <span class="review-collapse-sub"><i class="fas fa-user-circle"></i> Submitted by ${escapeHTML(data.authorName)}</span>
          <i class="fas fa-chevron-down review-collapse-caret"></i>
        </summary>
        <div class="review-collapse-body">
          <div class="review-meta-grid">
            <div class="review-meta"><label>Ticket Number</label><span>${escapeHTML(data.ticketNumber || data.id || 'N/A')}</span></div>
            <div class="review-meta"><label>Branch</label><span>${escapeHTML(data.branchName)}</span></div>
            <div class="review-meta"><label>Reporter</label><span>${escapeHTML(data.authorName)}</span></div>
            <div class="review-meta"><label>Reported Date</label><span>${escapeHTML(formatDate(data.submittedAt))}</span></div>
            <div class="review-meta"><label>Incident</label><span>${escapeHTML(data.title)}</span></div>
            <div class="review-meta"><label>Incident Date</label><span>${escapeHTML(data.datetime || data.dateTime || '—')}</span></div>
            <div class="review-meta"><label>Location</label><span>${escapeHTML(data.location || '—')}</span></div>
            <div class="review-meta"><label>Priority</label><span>${escapeHTML(data.priority || '—')}</span></div>
            <div class="review-meta"><label>Position</label><span>${escapeHTML(data.position || '—')}</span></div>
            <div class="review-meta"><label>Contact</label><span>${escapeHTML(data.contact || '—')}</span></div>
            <div class="review-meta full"><label>Email</label><span>${escapeHTML(data.email || '—')}</span></div>
            <div class="review-meta full"><label>Issue Description</label><p class="review-note">${escapeHTML(data.description || 'No description provided.')}</p></div>
          </div>
          <div class="review-attachments-label"><i class="fas fa-paperclip"></i> Requester's Attachments <span>(${requesterFiles.length})</span></div>
          <div class="owner-attachment-list">${requesterAttHtml}</div>
        </div>
      </details>

      <!-- ===== SECTION 2: OPERATOR'S RESOLUTION ===== -->
      <div class="review-card operator">
        <div class="review-card-header">
          <h3><i class="fas fa-video"></i> Operator's Resolution Report</h3>
        </div>
        <div class="review-meta-grid">
          <div class="review-meta"><label>Resolved At</label><span>${escapeHTML(resolvedAt)}</span></div>
          <div class="review-meta"><label>Status</label><span>${escapeHTML(data.status || 'Resolved')}</span></div>
          <div class="review-meta full"><label>Action Taken / Findings</label><p class="review-note">${escapeHTML(resNotes)}</p></div>
        </div>
        <div class="review-attachments-label"><i class="fas fa-film"></i> Operator's Added Footage <span>(${operatorFiles.length})</span></div>
        <div class="owner-attachment-list">${operatorAttHtml}</div>
      </div>
    `;

    if (ownerReportModalBody) ownerReportModalBody.innerHTML = html;
    if (ownerReportModal) ownerReportModal.classList.add('active');
  }).catch((error) => {
    console.error('Failed to open report:', error);
  });
};

function closeOwnerReportModalFn() {
  if (ownerReportModal) ownerReportModal.classList.remove('active');
  try { if (window.RefreshState) window.RefreshState.clearModal('owner'); } catch (e) { /* ignore */ }
}

function bindOwnerEvents() {
  ownerNavItems.forEach((item) => {
    item.addEventListener('click', () => {
      switchOwnerTab(item.dataset.tab);
      // Close the mobile drawer after choosing a tab.
      document.body.classList.remove('mobile-nav-open');
    });
  });

  ownerReportSearch?.addEventListener('input', () => { saveOwnerReportFilters(); loadOwnerReports(); });
  ownerReportBranchFilter?.addEventListener('change', () => { saveOwnerReportFilters(); loadOwnerReports(); });
  ownerRefreshReports?.addEventListener('click', () => loadOwnerReports());
  closeOwnerReportModal?.addEventListener('click', closeOwnerReportModalFn);

  ownerReportModal?.addEventListener('click', (e) => {
    if (e.target === ownerReportModal) closeOwnerReportModalFn();
  });

  ownerLogoutBtn?.addEventListener('click', async () => {
    try {
      if (window.RefreshState) window.RefreshState.clearPage('owner');
      await auth.signOut();
      window.location.href = 'login.html';
    } catch (error) {
      console.error('Logout error:', error);
      showToast('Failed to log out.', 'error');
    }
  });
}

bindOwnerEvents();

// ===== Mobile navigation drawer (hamburger + backdrop) =====
(function initMobileOwnerNav() {
  const toggle = document.getElementById('ownerSidebarToggle');
  const backdrop = document.getElementById('ownerSidebarBackdrop');
  const close = () => document.body.classList.remove('mobile-nav-open');

  if (toggle) toggle.addEventListener('click', () => document.body.classList.toggle('mobile-nav-open'));
  if (backdrop) backdrop.addEventListener('click', close);
})();

auth.onAuthStateChanged(async (user) => {
  if (user) {
    clearTimeout(window.__ownerLoginTimer);

    // Restore the open report modal right away — its content loads directly from
    // Firestore and does not depend on the branch/user lookups below, so it
    // reappears immediately instead of popping in only after the page finishes
    // loading (part of the "refresh trail" on this screen).
    if (!ownerStateRestored) {
      try {
        const early = (window.RefreshState && window.RefreshState.restore('owner')) || {};
        if (early.modal === 'report' && early.id && typeof window.openOwnerReport === 'function') {
          window.openOwnerReport(early.id);
        }
      } catch (e) { /* ignore */ }
    }

    if (ownerUserEmail) ownerUserEmail.textContent = user.email;

    try {
      await loadBranches();
      await loadActiveUserPermissions(user);

      // ===== Role guard: operators belong in the main command dashboard, not the owner dashboard =====
      if (activeUserRole === 'operator') {
        window.location.href = 'main.html';
        return;
      }
    } catch (error) {
      console.error('Owner dashboard Firebase init failed:', error);
    }

    // ===== Refresh resilience: stay on the current owner tab/filter after refresh =====
    // Only runs on the first auth callback of a page load (see ownerStateRestored).
    if (!ownerStateRestored) {
      try {
        const savedOwner = (window.RefreshState && window.RefreshState.restore('owner')) || {};
        const OWNER_VALID_TABS = ['overview', 'reports'];
        if (savedOwner.tab && OWNER_VALID_TABS.includes(savedOwner.tab)) {
          switchOwnerTab(savedOwner.tab);
        }
        // Re-apply the saved Reports filter/search so the filtered view survives F5.
        if (savedOwner.tab === 'reports') {
          applyOwnerReportFilters(savedOwner);
        }
        ownerStateRestored = true;
      } catch (e) {
        console.error('Owner restore-state error:', e);
      }
    }
  } else {
    // Never bounce to login.html instantly on a transient `null` auth callback —
    // Firebase can fire it while the persisted session is still being restored,
    // which would show a refresh trail to the login page and straight back.
    // Only redirect when no session actually materialises.
    clearTimeout(window.__ownerLoginTimer);
    window.__ownerLoginTimer = setTimeout(() => {
      if (!auth.currentUser) window.location.href = 'login.html';
    }, 1500);
  }
});
