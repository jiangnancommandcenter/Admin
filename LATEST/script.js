/**
 * CCTV Command Center - Unified Application Script
 * Combines Branch Monitoring + Incident Ticketing System
 */

// ==============================================================
//  STATE
// ==============================================================

let branches = [];
let allLogs = [];
let allTickets = [];
let filteredTickets = [];
let statusChart = null;
let trendChart = null;
let currentViewBranch = null;
let currentPage = 1;
const ITEMS_PER_PAGE = 20;
let isInitialTicketLoad = true;

// ===== Pagination state for Branches & History tables =====
let historyPage = 1;
let branchPage = 1;
let filteredHistory = [];
let filteredBranches = [];

// ==============================================================
//  CLOUDINARY CONFIG (Ticket Attachments)
//  ⚠️ Replace with your own values after creating your Cloudinary
//     account + unsigned Upload Preset (Settings → Upload → Presets).
// ==============================================================
const CLOUDINARY_CLOUD_NAME = 'jlux07ne';
const CLOUDINARY_UPLOAD_PRESET = 'jiangnan';
const MAX_ATTACHMENT_SIZE_MB = 100;
const ALLOWED_ATTACHMENT_TYPES = [
    'image/jpeg','image/png','image/gif','image/webp','image/bmp',
    'video/mp4','video/webm','video/ogg',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','application/zip'
];
let currentTicketId = null;

// ==============================================================
//  SUPERADMIN CONFIG (Ticket Approval Workflow)
//  Role is loaded from the Firebase user document and not hardcoded.
// ==============================================================
let currentUserRole = 'operator';

async function syncCurrentUserRole() {
    if (!auth || !auth.currentUser || !auth.currentUser.email) {
        currentUserRole = 'operator';
        return currentUserRole;
    }

    try {
        const profile = await window.getUserProfile(auth.currentUser.email);
        currentUserRole = (profile && profile.role) ? String(profile.role).toLowerCase() : 'operator';
    } catch (error) {
        console.warn('Failed to sync current user role from Firebase:', error && error.message ? error.message : error);
        currentUserRole = 'operator';
    }

    return currentUserRole;
}

function isSuperAdmin(user) {
    if (!user || !user.email) return false;
    return currentUserRole === 'superadmin';
}

function currentUserIsSuperAdmin() {
    return currentUserRole === 'superadmin';
}

// Show/hide admin-only UI controls and re-render action buttons based on role.
// Operators keep workflow actions (Start / Resolve / Reopen / Add Status) but
// lose Edit / Delete on tickets, branches, and history records.
function refreshPermissionUI() {
    const isAdmin = currentUserIsSuperAdmin();

    // Ticket Approvals tab + Pending Approvals (superadmin only)
    const approvalsNav = document.getElementById('approvalsNavItem');
    if (approvalsNav) approvalsNav.style.display = isAdmin ? 'flex' : 'none';

    // Users / Pending Approvals management tab (superadmin only)
    if (usersNavItem) usersNavItem.style.display = isAdmin ? 'flex' : 'none';

    // Manage Branches button (superadmin only)
    if (btnManageBranches) btnManageBranches.style.display = isAdmin ? 'inline-flex' : 'none';

    // Bulk Delete button (superadmin only)
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    if (bulkDeleteBtn) bulkDeleteBtn.style.display = isAdmin ? 'inline-flex' : 'none';

    // "New" branch button inside the Add Status modal (superadmin only)
    if (btnAddBranch) btnAddBranch.style.display = isAdmin ? 'inline-flex' : 'none';

    // Re-render tables so Edit/Delete action buttons appear for superadmins only
    if (typeof renderBranchesTable === 'function') renderBranchesTable();
    if (typeof renderHistory === 'function') renderHistory();
    if (typeof filterTickets === 'function') filterTickets();
    updateApprovalsBadge();
}

async function maybeOpenPendingApprovals() {
    if (!auth || !auth.currentUser || currentUserRole !== 'superadmin') return;
    try {
        if (!db || typeof db.collection !== 'function') return;
        const snapshot = await db.collection('users').where('status', '==', 'pending').limit(1).get();
        if (!snapshot.empty) {
            await switchTab('users');
        }
    } catch (error) {
        console.warn('Could not auto-open pending approvals:', error && error.message ? error.message : error);
    }
}

/**
 * Resolve the display status for a ticket given its `status` +
 * `approvalStatus` fields under the superadmin approval workflow:
 *  - Resolved + pending_approval  -> "Pending Approval"
 *  - Resolved + approved          -> "Resolved"
 *  - Resolved + rejected / "For Revision" -> "For Revision"
 */
function getDisplayStatus(ticket) {
    const status = ticket.status || 'Pending';
    const approval = ticket.approvalStatus || 'pending';
    if (status === 'Resolved') {
        return approval === 'approved' ? 'Resolved' : 'Pending Approval';
    }
    if (status === 'For Revision') return 'For Revision';
    return status;
}

function isPendingApproval(ticket) {
    return (ticket.status || 'Pending') === 'Resolved' && (ticket.approvalStatus || 'pending') === 'pending_approval';
}

function isApprovedTicket(ticket) {
    return (ticket.status || 'Pending') === 'Resolved' && (ticket.approvalStatus || 'pending') === 'approved';
}

function isRejectedTicket(ticket) {
    return (ticket.approvalStatus || 'pending') === 'rejected' || (ticket.status || '') === 'For Revision';
}

// ==============================================================
//  DOM REFERENCES
// ==============================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Sidebar
const navItems = $$('.nav-item');
const tabContents = $$('.tab-content');
const pageTitle = $('#pageTitle');
const pageSubtitle = $('#pageSubtitle');
const offlineBadge = $('#offlineBadge');
const pendingBadge = $('#pendingBadge');
const logoutBtn = $('#logoutBtn');
const loginBtnSidebar = $('#loginBtn');
const authStatus = $('#authStatus');
const authStatusText = $('#authStatusText');

// Dashboard
const onlineCount = $('#onlineCount');
const offlineCount = $('#offlineCount');
const activeOutages = $('#activeOutages');
const totalDowntime = $('#totalDowntime');
const quickStatusList = $('#quickStatusList');
const totalTickets = $('#totalTickets');
const pendingTickets = $('#pendingTickets');
const progressTickets = $('#progressTickets');
const resolvedTickets = $('#resolvedTickets');

// Branches
const searchInput = $('#searchInput');
const filterBtns = $$('.filter-btn[data-filter]');
const groupFilter = $('#groupFilter');
const downtimeFilter = $('#downtimeFilter');
const sortSelect = $('#sortSelect');
const branchesTableBody = $('#branchesTableBody');

// History
const historySearch = $('#historySearch');
const historyBranchFilter = $('#historyBranchFilter');
const historyDateFrom = $('#historyDateFrom');
const historyDateTo = $('#historyDateTo');
const historyFilterBtns = $$('.filter-btn[data-history-filter]');
const historyTableBody = $('#historyTableBody');
const btnPrintReport = $('#btnPrintReport');
const reportMonthInput = $('#reportMonth');

// Tickets
const ticketSearch = $('#ticketSearch');
const ticketStatusFilter = $('#ticketStatusFilter');
const ticketPriorityFilter = $('#ticketPriorityFilter');
const ticketBranchFilter = $('#ticketBranchFilter');
const ticketSearchBtn = $('#ticketSearchBtn');
const ticketList = $('#ticketList');
const paginationControls = $('#paginationControls');
const bulkBar = $('#bulkBar');
const bulkCount = $('#bulkCount');
const selectAll = $('#selectAll');

// Approvals tab
const approvalSearch = $('#approvalSearch');
const approvalStatusFilter = $('#approvalStatusFilter');
const approvalBranchFilter = $('#approvalBranchFilter');
const approvalListBody = $('#approvalListBody');
const approvalPagination = $('#approvalPagination');
const approvalTotalCount = $('#approvalTotalCount');
const approvalPendingCount = $('#approvalPendingCount');
const approvalApprovedCount = $('#approvalApprovedCount');
const approvalRejectedCount = $('#approvalRejectedCount');
const approvalsBadge = $('#approvalsBadge');
const approvalDetailsModal = $('#approvalDetailsModal');
const closeApprovalDetails = $('#closeApprovalDetails');
const approvalDetailsTitle = $('#approvalDetailsTitle');
const approvalDetailsBody = $('#approvalDetailsBody');
const approvalDetailsStatus = $('#approvalDetailsStatus');
const approvalModalFooter = $('#approvalModalFooter');
const btnApproveApproval = $('#btnApproveApproval');
const btnRejectApproval = $('#btnRejectApproval');
const approvalAttachmentsGrid = $('#approvalAttachmentsGrid');
const approvalAttachmentInput = $('#approvalAttachmentInput');
const btnUploadApprovalAttachment = $('#btnUploadApprovalAttachment');
const approvalUploadStatus = $('#approvalUploadStatus');

// User Management (Superadmin)
const usersNavItem = $('#usersNavItem');
const usersListBody = $('#usersListBody');
const userStatusFilter = $('#userStatusFilter');

// Edit Approval Information Modal (Superadmin)
const editApprovalModal = $('#editApprovalModal');
const closeEditApprovalModal = $('#closeEditApprovalModal');
const cancelEditApproval = $('#cancelEditApproval');
const editApprovalTitle = $('#editApprovalTitle');
const editApprovalTicketId = $('#editApprovalTicketId');
const editApprovalNotes = $('#editApprovalNotes');
const editApprovalAttachmentInput = $('#editApprovalAttachmentInput');
const btnUploadEditApprovalAttachment = $('#btnUploadEditApprovalAttachment');
const editApprovalUploadStatus = $('#editApprovalUploadStatus');
const editApprovalError = $('#editApprovalError');
const saveApprovalInfoBtn = $('#saveApprovalInfoBtn');

// Resolve / Reject Modals
const resolveModal = $('#resolveModal');
const closeResolveModal = $('#closeResolveModal');
const cancelResolve = $('#cancelResolve');
const resolveModalTitle = $('#resolveModalTitle');
const resolutionNotesEl = $('#resolutionNotes');
const resolveAttachmentInput = $('#resolveAttachmentInput');
const submitResolutionBtn = $('#submitResolutionBtn');
const rejectModal = $('#rejectModal');
const closeRejectModal = $('#closeRejectModal');
const cancelReject = $('#cancelReject');
const rejectReasonInput = $('#rejectReasonInput');
const submitRejectionBtn = $('#submitRejectionBtn');
const rejectError = $('#rejectError');

// Revise & Resubmit Modal (For Revision tickets)
const revisionModal = $('#revisionModal');
const closeRevisionModal = $('#closeRevisionModal');
const cancelRevision = $('#cancelRevision');
const revisionModalTitle = $('#revisionModalTitle');
const revisionRejectionReason = $('#revisionRejectionReason');
const revisionNotesEl = $('#revisionNotes');
const revisionAttachmentInput = $('#revisionAttachmentInput');
const revisionUploadStatus = $('#revisionUploadStatus');
const revisionError = $('#revisionError');
const submitRevisionBtn = $('#submitRevisionBtn');

// Approval workflow state
let currentResolveTicketId = null;
let currentRejectTicketId = null;
let currentApprovalTicketId = null;
let approvalPage = 1;
let filteredApprovalTickets = [];

// Add Status Modal
const addModal = $('#addModal');
const btnAddStatus = $('#btnAddStatus');
const closeAddModal = $('#closeAddModal');
const cancelAdd = $('#cancelAdd');
const addForm = $('#addStatusForm');
const branchSelect = $('#branchSelect');
const statusSelect = $('#statusSelect');
const dateInput = $('#dateInput');
const timeInput = $('#timeInput');
const remarksInput = $('#remarksInput');
const validationWarning = $('#validationWarning');
const validationMessage = $('#validationMessage');
const btnAddBranch = $('#btnAddBranch');
const newBranchGroup = $('#newBranchGroup');
const newBranchInput = $('#newBranchInput');
const statusSegmentedGroup = $('#statusSegmentedGroup');

// View Branch Modal
const viewModal = $('#viewModal');
const closeViewModal = $('#closeViewModal');
const viewBranchName = $('#viewBranchName');
const viewCurrentStatus = $('#viewCurrentStatus');
const viewLastUpdated = $('#viewLastUpdated');
const viewRemarks = $('#viewRemarks');
const viewDowntime = $('#viewDowntime');
const statOutages = $('#statOutages');
const statTotalDowntime = $('#statTotalDowntime');
const statLongestOutage = $('#statLongestOutage');
const statAvgOutage = $('#statAvgOutage');
const statAvailability = $('#statAvailability');
const viewHistoryBody = $('#viewHistoryBody');

// Ticket Modals
const ticketModal = $('#ticketModal');
const closeTicketModal = $('#closeTicketModal');
const editTicketModal = $('#editTicketModal');
const closeEditModal = $('#closeEditModal');
const modalTicketTitle = $('#modalTicketTitle');
const ticketModalBody = $('#ticketModalBody');
const editModalTitle = $('#editModalTitle');

const datetimeDisplay = $('#datetimeDisplay');

// Submit Ticket Form
const ticketForm = $('#ticketForm');
const branchSelectTicket = $('#branch');
const prioritySelect = $('#priority');

// Branch Management
const branchListModal = $('#branchListModal');
const btnManageBranches = $('#btnManageBranches');
const closeBranchListModal = $('#closeBranchListModal');
const closeBranchListBtn = $('#closeBranchListBtn');
const newBranchNameInput = $('#newBranchNameInput');
const btnAddNewBranch = $('#btnAddNewBranch');
const branchListBody = $('#branchListBody');

// ==============================================================
//  UTILITY FUNCTIONS
// ==============================================================

function formatDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function toISODate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function toISOTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function formatDuration(minutes) {
    if (minutes === null || minutes === undefined || minutes < 0) return '\u2014';
    if (minutes < 1) return '< 1m';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h 0m`;
    return `${mins}m`;
}

function getDurationMinutes(startDate, endDate) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    return Math.max(0, (end - start) / (1000 * 60));
}

function getCurrentDowntimeText(branch) {
    if (!branch || branch.currentStatus !== 'Offline' || !branch.currentDowntimeStart) return '\u2014';
    const start = branch.currentDowntimeStart.toDate ? branch.currentDowntimeStart.toDate() : new Date(branch.currentDowntimeStart);
    return formatDuration(getDurationMinutes(start, new Date()));
}

function getCurrentDowntimeMinutes(branch) {
    if (!branch || branch.currentStatus !== 'Offline' || !branch.currentDowntimeStart) return 0;
    const start = branch.currentDowntimeStart.toDate ? branch.currentDowntimeStart.toDate() : new Date(branch.currentDowntimeStart);
    return getDurationMinutes(start, new Date());
}

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ==============================================================
//  CONFIRM DIALOG (Styled replacement for native confirm())
// ==============================================================

let confirmResolveCallback = null;

function showConfirmDialog(options = {}) {
    const {
        title = 'Confirm',
        message = 'Are you sure?',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        danger = false,
        icon = 'fa-question-circle'
    } = options;

    return new Promise((resolve) => {
        confirmResolveCallback = resolve;

        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmModalTitle');
        const messageEl = document.getElementById('confirmModalMessage');
        const acceptBtn = document.getElementById('acceptConfirmBtn');
        const cancelBtn = document.getElementById('cancelConfirmBtn');
        const iconEl = document.getElementById('confirmModalIcon');

        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.innerHTML = message;
        if (cancelBtn) cancelBtn.textContent = cancelText;
        if (iconEl) {
            iconEl.className = 'fas ' + icon + ' confirm-modal-icon';
            iconEl.style.color = danger ? 'var(--color-danger)' : 'var(--color-warning)';
        }
        if (acceptBtn) {
            acceptBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
            acceptBtn.innerHTML = '<i class="fas ' + (danger ? 'fa-trash-alt' : 'fa-check') + '"></i> ' + confirmText;
        }
        if (modal) modal.classList.add('active');
        if (acceptBtn) acceptBtn.focus();
    });
}

function closeConfirmDialog(result) {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.remove('active');
    if (confirmResolveCallback) {
        const cb = confirmResolveCallback;
        confirmResolveCallback = null;
        cb(result);
    }
}

(function initConfirmModal() {
    const modal = document.getElementById('confirmModal');
    const acceptBtn = document.getElementById('acceptConfirmBtn');
    const cancelBtn = document.getElementById('cancelConfirmBtn');
    const closeBtn = document.getElementById('closeConfirmModal');

    if (acceptBtn) acceptBtn.addEventListener('click', () => closeConfirmDialog(true));
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeConfirmDialog(false));
    if (closeBtn) closeBtn.addEventListener('click', () => closeConfirmDialog(false));
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeConfirmDialog(false); });
})();

// ==============================================================
//  AUTH STATE
// ==============================================================

auth.onAuthStateChanged(async (user) => {
    if (!authStatusText) return;
    if (user) {
        authStatusText.textContent = user.email || 'Logged In';
        if (logoutBtn) logoutBtn.style.display = 'flex';
        if (loginBtnSidebar) loginBtnSidebar.style.display = 'none';
        await syncCurrentUserRole();

        // ===== Role guard: owners belong in the Owner Dashboard =====
        if (currentUserRole === 'owner') {
            window.location.href = 'ownerdashboard.html';
            return;
        }

        // ===== Role-based UI gating (operators vs superadmin) =====
        refreshPermissionUI();

        // ===== Refresh resilience: land back on the tab/modal the user was on =====
        // This runs ONCE per page load and only once we have a REAL signed-in user.
        // Firebase can fire a transient `null` callback while the persisted session
        // is still being restored; restoring then would route restricted tabs to the
        // dashboard and finalize the restore too early.
        if (!mainStateRestored) {
            // Snapshot what was open *before* maybeOpenPendingApprovals can change it.
            const savedMainState = (window.RefreshState && window.RefreshState.restore(MAIN_STATE_KEY)) || {};

            // Auto-open the Pending Approvals tab only when there is no saved tab to
            // return to; otherwise the saved view always wins (no mid-load tab jump).
            if (currentUserRole === 'superadmin' && !savedMainState.tab) {
                await maybeOpenPendingApprovals();
            }

            await restoreLastMainState(savedMainState);
            mainStateRestored = true;
        }
    } else {
        currentUserRole = 'operator';
        authStatusText.textContent = 'Not logged in';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (loginBtnSidebar) loginBtnSidebar.style.display = 'flex';

        // Defer the role-based UI hiding: a transient `null` auth callback can
        // arrive while the persisted session is still restoring, and hiding the
        // superadmin nav items then would flicker them off and back on.
        clearTimeout(window.__guestUIRefreshTimer);
        window.__guestUIRefreshTimer = setTimeout(() => {
            if (!auth.currentUser) refreshPermissionUI();
        }, 600);
    }
});

if (loginBtnSidebar) {
    loginBtnSidebar.addEventListener('click', () => {
        window.location.href = 'login.html';
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        // ===== Refresh-state: wipe saved tab/modal on logout so the next
        //       session never starts on a stale page/modal. =====
        if (window.RefreshState) window.RefreshState.clearPage('main');
        window.handleLogout();
    });
}

// =============================================================
//  REFRESH STATE — stay on the current tab/modal after F5 instead of
//  always bouncing back to the default dashboard.
// =============================================================

const MAIN_STATE_KEY = 'main';
const MAIN_VALID_TABS = ['dashboard', 'branches', 'history', 'tickets', 'users', 'approvals'];

// One-shot flag: the refresh state (saved tab/modal) is restored exactly once
// after each page load so a later auth callback can never snap the user away
// from the view they are currently using.
let mainStateRestored = false;

function getActiveMainTab() {
    // The sidebar nav item for the active tab carries the .active class.
    try {
        const el = document.querySelector('#sidebar .nav-item.active');
        return (el && el.dataset && el.dataset.tab) ? el.dataset.tab : 'dashboard';
    } catch (e) { return 'dashboard'; }
}

function clearMainModalCtx() {
    try { if (window.RefreshState) window.RefreshState.clearModal(MAIN_STATE_KEY); } catch (e) { /* ignore */ }
}

// Central capture for the main dashboard view. Always records the active tab and
// the current user's role so the *synchronous* pre-restore (below) can decide
// whether a superadmin-only tab may be shown before the async role check lands.
function captureMainState(extra) {
    try {
        if (window.RefreshState) {
            window.RefreshState.capture(MAIN_STATE_KEY, Object.assign(
                { role: currentUserIsSuperAdmin() ? 'superadmin' : 'operator' },
                extra || {}
            ));
        }
    } catch (e) { /* ignore */ }
}

// Re-opens a details modal that was open when the user refreshed. Ticket data
// loads asynchronously (realtime listener), so poll briefly until the ticket is
// in memory, then open the modal exactly as if the user had clicked it.
function tryReopenMainModal(modal, id, attempts) {
    if (!modal || !id) { clearMainModalCtx(); return; }
    attempts = (typeof attempts === 'number') ? attempts : 12;

    let opened = false;
    if (modal === 'ticket' && allTickets.some(t => t.id === id)) {
        if (typeof window.openTicketModal === 'function') { window.openTicketModal(id); opened = true; }
    } else if (modal === 'approval' && allTickets.some(t => t.id === id)) {
        if (typeof window.openApprovalDetails === 'function') { window.openApprovalDetails(id); opened = true; }
    } else if (modal === 'branch' && branches.some(b => b.branchName === id)) {
        openViewModal(id); opened = true;          // openViewModal is a hoisted declaration
    }

    if (opened) {
        clearMainModalCtx();                        // modal opened — drop the pending flag
    } else if (attempts > 0) {
        setTimeout(() => tryReopenMainModal(modal, id, attempts - 1), 400);
    } else {
        clearMainModalCtx();                        // stale record (deleted ticket) — clean up
    }
}

async function restoreLastMainState(savedTab) {
    if (!savedTab) savedTab = (window.RefreshState && window.RefreshState.restore(MAIN_STATE_KEY)) || {};

    // Restore the tab. switchTab already re-routes superadmin-only tabs for
    // non-superadmins, so stale state can never surface a forbidden page.
    if (savedTab.tab && MAIN_VALID_TABS.includes(savedTab.tab)) {
        await switchTab(savedTab.tab);
    }

    // Re-open whichever details modal was open (deferred until data is ready).
    if (savedTab.modal && savedTab.id) {
        tryReopenMainModal(savedTab.modal, savedTab.id, 12);
    }
}

// ===== Flash-free restore =====
// This runs synchronously while the page is still being parsed, i.e. BEFORE the
// first paint. It activates the saved tab immediately so a refresh re-opens the
// exact view with no visible "Dashboard then Ticket Approvals" jump. The async
// auth observer re-checks everything afterwards (role guard, data rendering).
(function preRestoreActiveMainTab() {
    try {
        if (!window.RefreshState) return;
        const saved = window.RefreshState.restore(MAIN_STATE_KEY) || {};
        const tabId = saved.tab;
        if (!tabId || !MAIN_VALID_TABS.includes(tabId)) return;

        // Superadmin-only tabs may only be pre-activated when the role recorded
        // at capture time was superadmin (or empty/legacy — only a superadmin could
        // ever have captured these tabs, and the async role check re-verifies).
        // Anything recorded as a plain operator waits for the async check, which
        // routes stale/forbidden tabs back to the dashboard.
        if ((tabId === 'users' || tabId === 'approvals') && saved.role === 'operator') return;

        navItems.forEach(item => { item.classList.toggle('active', item.dataset.tab === tabId); });
        tabContents.forEach(tab => { tab.classList.toggle('active', tab.id === `tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`); });

        // Reveal the superadmin-only nav links synchronously as well, so the
        // "Pending Approvals" / "Ticket Approvals" items don't disappear on
        // refresh and then pop back once the async role check finishes.
        // (Any stale/forbidden case is re-hidden by the auth observer.)
        if (saved.role === 'superadmin' || tabId === 'users' || tabId === 'approvals') {
            if (usersNavItem) usersNavItem.style.display = 'flex';
            const approvalsNavEl = document.getElementById('approvalsNavItem');
            if (approvalsNavEl) approvalsNavEl.style.display = 'flex';
        }

        const titles = { dashboard: 'Dashboard', branches: 'Branch Monitor', history: 'Status History', tickets: 'Tickets', users: 'Pending Approvals', approvals: 'Ticket Approvals' };
        const subtitles = { dashboard: 'Overview & Analytics', branches: 'Real-time Branch Health Status', history: 'Status Change Logs', tickets: 'Incident Ticket Management', users: 'Review new owner sign-ups', approvals: 'Superadmin Approval Workflow' };
        if (pageTitle) pageTitle.textContent = titles[tabId] || 'Dashboard';
        if (pageSubtitle) pageSubtitle.textContent = subtitles[tabId] || '';
    } catch (e) { /* ignore */ }
})();

// ==============================================================
//  INITIALIZATION
// ==============================================================

function initDateTime() {
    if (!datetimeDisplay) return;
    function update() {
        const now = new Date();
        datetimeDisplay.textContent = `${formatDate(now)} ${formatTime(now)}`;
    }
    update();
    setInterval(update, 1000);
}

function setDefaultDateTime() {
    if (!dateInput || !timeInput) return;
    const now = new Date();
    dateInput.value = toISODate(now);
    timeInput.value = toISOTime(now);
}

function setDefaultReportMonth() {
    if (!reportMonthInput) return;
    const now = new Date();
    reportMonthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

/**
 * Resolve the report month from the `#reportMonth` picker. Returns the first
 * day of the selected month (or the current month when no value is set).
 */
function getSelectedReportMonth() {
    let value = reportMonthInput ? reportMonthInput.value : '';
    if (!value) {
        const now = new Date();
        value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    const parts = value.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-based
    return new Date(year, month, 1);
}

async function initApp() {
    try {
        initDateTime();
        setDefaultDateTime();
        setDefaultReportMonth();
        await loadBranchData();
        
        if (branchesTableBody) {
            renderDashboard();
            renderBranchesTable();
            renderHistory();
            populateHistoryBranchFilter();
            populateGroupFilter();
            populateTicketBranchFilter();
        }
        
        populateSubmitBranchSelect();
        await loadTicketsDirect();
        // ===== Keep the sidebar Approvals badge in sync on initial load =====
        updateApprovalsBadge();
        setupTicketListener();
    } catch (e) {
        console.error('initApp error:', e);
    }
}

async function loadTicketsDirect() {
    try {
        const tickets = await firestoreService.getTickets();
        if (tickets.length > 0) {
            allTickets = tickets;
            filterTickets();
            updateTicketDashboard();
            updatePendingBadge();
            isInitialTicketLoad = false;
        } else {
            await seedSampleTickets();
            const seededTickets = await firestoreService.getTickets();
            if (seededTickets.length > 0) {
                allTickets = seededTickets;
                filterTickets();
                updateTicketDashboard();
                updatePendingBadge();
                isInitialTicketLoad = false;
            }
        }
    } catch (error) {
        console.error('Error loading tickets directly:', error);
        await seedSampleTickets();
        const seededTickets = await firestoreService.getTickets();
        if (seededTickets.length > 0) {
            allTickets = seededTickets;
            filterTickets();
            updateTicketDashboard();
            updatePendingBadge();
            isInitialTicketLoad = false;
        }
    }
}

// ==============================================================
//  BRANCH DATA LOADING
// ==============================================================

async function loadBranchData() {
    try {
        branches = await firestoreService.getBranches();
        allLogs = await firestoreService.getAllLogs();

        if (branches.length === 0) {
            await seedDefaultBranches();
            branches = await firestoreService.getBranches();
        }

        for (let i = 0; i < branches.length; i++) {
            const branch = branches[i];
            const logs = await firestoreService.getBranchLogs(branch.branchName);
            if (logs.length > 0) {
                const latest = logs[0];
                const updateData = {
                    currentStatus: latest.status,
                    lastUpdated: latest.dateTime,
                    remarks: latest.remarks || branch.remarks || ''
                };
                if (latest.status === 'Offline') {
                    updateData.currentDowntimeStart = latest.dateTime;
                } else {
                    updateData.currentDowntimeStart = null;
                }
                await firestoreService.setBranch(branch.branchName, updateData);
                branch.currentStatus = latest.status;
                branch.lastUpdated = latest.dateTime;
                branch.currentDowntimeStart = updateData.currentDowntimeStart;
                branch.remarks = updateData.remarks;
            }
        }
    } catch (error) {
        console.error('Error loading branch data:', error);
        console.log('Failed to load branch data.');
    }
}

async function loadSuperadminUsers() {
    if (!usersListBody) return;
    // Superadmin-only data (all user accounts) — block operators even via console.
    if (!currentUserIsSuperAdmin()) return;

    const statusFilter = userStatusFilter ? userStatusFilter.value : 'all';

    try {
        const snapshot = await db.collection('users').get();
        let users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        users = users.filter(user => {
            const email = (user.email || user.id || '').toString().trim();
            return email.length > 0;
        });

        if (statusFilter !== 'all') {
            users = users.filter(u => (u.status || 'approved') === statusFilter);
        } else {
            users = users.filter(u => (u.status || '').toLowerCase() !== 'approved' && (u.status || '').toLowerCase() !== 'rejected');
            if (!users.length) {
                users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(user => {
                    const email = (user.email || user.id || '').toString().trim();
                    return email.length > 0;
                });
            }
        }

        users.sort((a, b) => {
            const aKey = String((a.email || a.id || '')).toLowerCase();
            const bKey = String((b.email || b.id || '')).toLowerCase();
            return aKey.localeCompare(bKey);
        });

        if (!users.length) {
            usersListBody.innerHTML = '<tr><td colspan="5" class="empty-state"><em>No pending approvals.</em></td></tr>';
            return;
        }

        let html = '';
        users.forEach(user => {
            const safeEmail = sanitizeUserId(user.email || user.id);
            const status = user.status || 'approved';
            const statusClass = status === 'pending' ? 'pending'
                : (status === 'rejected' ? 'rejected' : 'approved');
            const branchText = (user.branches || []).join(', ') || 'None';

            // Main (collapsed) row - clicking toggles the details panel.
            html += `
                <tr class="user-row" data-email="${escapeHTML(user.email || '')}" style="cursor:pointer;">
                    <td>${escapeHTML(user.email || user.id)}</td>
                    <td>${escapeHTML(user.name || '—')}</td>
                    <td>${escapeHTML(branchText)}</td>
                    <td><span class="status-badge ${statusClass}">${escapeHTML(status[0].toUpperCase() + status.slice(1))}</span></td>
                    <td>
                        <div class="approval-action-stack">
                            <button type="button" class="btn btn-icon btn-danger" data-delete-user="${escapeHTML(user.email || '')}" title="Delete user"><i class="fas fa-trash"></i></button>
                            <button type="button" class="btn btn-icon action-btn view" data-tooltip="Review / Configure" data-toggle-user="${escapeHTML(user.email || '')}"><i class="fas fa-chevron-down"></i></button>
                        </div>
                    </td>
                </tr>

                <!-- Expandable details row: branch + permission checkboxes (hidden by default) -->
                <tr class="user-detail-row" id="userDetail-${safeEmail}" style="display:none;">
                    <td colspan="5" style="padding:0;background:var(--bg-hover);">
                        <div class="user-detail-panel">
                            <div class="detail-head">
                                <strong>${escapeHTML(user.name || user.email)}</strong>
                                <span style="color:var(--text-muted);font-size:0.85rem;">${escapeHTML(user.email || '')}</span>
                            </div>

                            <div class="form-group full-width">
                                <label>Branch Access</label>
                                <div class="branch-checkbox-grid" id="db-${safeEmail}">
                                    ${renderDetailBranchCheckboxes(userEmailKey(user), user.branches || [])}
                                </div>
                            </div>
                            <div class="divider" style="margin:14px 0;"></div>
                            <div class="form-group full-width">
                                <label>Feature Permissions</label>
                                <div class="permission-grid">
                                    <label class="checkbox-label"><input type="checkbox" id="dp-view-${safeEmail}" ${(user.permissions && user.permissions.viewOnly) ? 'checked' : ''}> View Only</label>
                                    <label class="checkbox-label"><input type="checkbox" id="dp-edit-${safeEmail}" ${(user.permissions && user.permissions.canEdit) ? 'checked' : ''}> Can Edit</label>
                                    <label class="checkbox-label"><input type="checkbox" id="dp-download-${safeEmail}" ${(user.permissions && user.permissions.canDownload) ? 'checked' : ''}> Can Download Files</label>
                                </div>
                            </div>
                            <div class="detail-actions">
                                <button type="button" class="btn btn-sm btn-success" data-approve-user="${escapeHTML(user.email || '')}"><i class="fas fa-check"></i> Approve</button>
                                <button type="button" class="btn btn-sm btn-danger" data-reject-user="${escapeHTML(user.email || '')}"><i class="fas fa-times"></i> Reject</button>
                            </div>
                        </div>
                    </td>
                </tr>

                <tr class="user-detail-gap" style="height:0;"></tr>
            `;
        });

        usersListBody.innerHTML = html;

        // Toggle expand/collapse on the chevron and on the row click.
        usersListBody.querySelectorAll('[data-toggle-user]').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); toggleUserDetails(btn.dataset.toggleUser); });
        });
        usersListBody.querySelectorAll('.user-row').forEach(row => {
            row.addEventListener('click', () => toggleUserDetails(row.dataset.email));
        });
        usersListBody.querySelectorAll('[data-approve-user]').forEach(btn => {
            btn.addEventListener('click', () => approveUser(btn.dataset.approveUser));
        });
        usersListBody.querySelectorAll('[data-delete-user]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteUser(btn.dataset.deleteUser);
            });
        });
        usersListBody.querySelectorAll('[data-save-user]').forEach(btn => {
            btn.addEventListener('click', () => updateUserPermissions(btn.dataset.saveUser));
        });
        usersListBody.querySelectorAll('[data-reject-user]').forEach(btn => {
            btn.addEventListener('click', () => rejectUser(btn.dataset.rejectUser));
        });
    } catch (error) {
        console.error('Failed to load users:', error);
        usersListBody.innerHTML = '<tr><td colspan="5" class="empty-state"><em>Unable to load approvals.</em></td></tr>';
    }
}

// Build a safe DOM id/container key from an email.
function sanitizeUserId(email) {
    return String(email || 'u').toLowerCase().replace(/[^a-z0-9]/g, '_');
}
function userEmailKey(user) { return user.email || user.id || ''; }

// Render the branch checkboxes for a user's detail panel (pre-checking current).
function renderDetailBranchCheckboxes(email, selectedBranches) {
    if (!branches || !branches.length) return '<p style="color:var(--text-muted);font-size:0.85rem;">No branches loaded.</p>';
    const safeEmail = sanitizeUserId(email);
    return branches.map(branch => {
        const bname = branch.branchName || branch.id || '';
        const checked = (selectedBranches || []).includes(bname) ? 'checked' : '';
        return `
            <label class="quick-access-item">
                <span class="quick-access-name">${escapeHTML(bname)}</span>
                <input type="checkbox" name="detailBranch_${safeEmail}" value="${escapeHTML(bname)}" ${checked}>
            </label>
        `;
    }).join('');
}

function toggleUserDetails(email) {
    if (!email) return;
    const safeEmail = sanitizeUserId(email);
    const row = document.getElementById('userDetail-' + safeEmail);
    if (!row) return;
    const show = row.style.display === 'none';
    row.style.display = show ? '' : 'none';
    const btn = document.querySelector(`[data-toggle-user="${CSS.escape(email)}"]`);
    if (btn) {
        const icon = btn.querySelector('i');
        if (icon) icon.className = show ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    }
}

function getUserDetailData(email) {
    const safeEmail = sanitizeUserId(email);
    const branchesSelected = Array.from(document.querySelectorAll(`input[name="detailBranch_${safeEmail}"]:checked`)).map(i => i.value);
    return {
        branches: branchesSelected,
        permissions: {
            viewOnly: !!(document.getElementById('dp-view-' + safeEmail) && document.getElementById('dp-view-' + safeEmail).checked),
            canEdit: !!(document.getElementById('dp-edit-' + safeEmail) && document.getElementById('dp-edit-' + safeEmail).checked),
            canDownload: !!(document.getElementById('dp-download-' + safeEmail) && document.getElementById('dp-download-' + safeEmail).checked)
        }
    };
}

function getUserEmailLower(email) { return String(email || '').trim().toLowerCase(); }

async function approveUser(email) {
    const lower = getUserEmailLower(email);
    const detail = getUserDetailData(email);
    try {
        await db.collection('users').doc(lower).update({
            role: 'owner',
            branches: detail.branches,
            permissions: detail.permissions,
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('User approved.', 'success');
        await loadSuperadminUsers();
    } catch (error) {
        console.error('Failed to approve user:', error);
        showToast('Unable to approve user.', 'error');
    }
}

async function updateUserPermissions(email) {
    const lower = getUserEmailLower(email);
    const detail = getUserDetailData(email);
    try {
        await db.collection('users').doc(lower).update({
            role: 'owner',
            branches: detail.branches,
            permissions: detail.permissions,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Permissions saved.', 'success');
        await loadSuperadminUsers();
    } catch (error) {
        console.error('Failed to save user permissions:', error);
        showToast('Unable to save permissions.', 'error');
    }
}

async function rejectUser(email) {
    const lower = getUserEmailLower(email);
    if (!confirm('Reject this user registration? They will not be able to access the dashboard.')) return;
    try {
        await db.collection('users').doc(lower).update({
            status: 'rejected',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('User registration rejected.', 'info');
        await loadSuperadminUsers();
    } catch (error) {
        console.error('Failed to reject user:', error);
        showToast('Unable to reject user.', 'error');
    }
}

async function deleteUser(email) {
    const lower = getUserEmailLower(email);
    if (!confirm('Delete this user permanently from the system? This action cannot be undone.')) return;
    try {
        await db.collection('users').doc(lower).delete();
        showToast('User deleted.', 'success');
        await loadSuperadminUsers();
    } catch (error) {
        console.error('Failed to delete user:', error);
        showToast('Unable to delete user.', 'error');
    }
}

const DEFAULT_BRANCH_NAMES = [
    'Banawe', 'BF Homes', 'Eastwood', 'Fame', 'Gil Fernando',
    'Hemady', 'Holy Spirit', 'MOA', 'Ortigas Center', 'Paseo',
    'Promenade', 'SM Clark', 'SM Fairview', 'SM Marikina', 'SM Marilao',
    'SM South Mall', 'SMDC Wind', 'SM East Ortigas', 'Sta. Rosa', 'SM Sucat', 'Tagaytay'
];

async function seedDefaultBranches() {
    const now = new Date();
    const offlineBranches = ['Banawe', 'BF Homes', 'Holy Spirit', 'SM Clark', 'Sta. Rosa', 'Tagaytay'];
    const hadOutageBranches = ['Banawe', 'Hemady', 'MOA', 'SM Fairview', 'Paseo'];

    for (const name of DEFAULT_BRANCH_NAMES) {
        const isOffline = offlineBranches.includes(name);
        await firestoreService.setBranch(name, {
            branchName: name,
            currentStatus: isOffline ? 'Offline' : 'Online',
            lastUpdated: firebase.firestore.Timestamp.fromDate(now),
            currentDowntimeStart: isOffline ? firebase.firestore.Timestamp.fromDate(now) : null,
            remarks: ''
        });

        if (hadOutageBranches.includes(name)) {
            const d1 = new Date(now); d1.setDate(d1.getDate() - 3); d1.setHours(9, 0, 0, 0);
            const d2 = new Date(d1); d2.setHours(d2.getHours() + 2);
            const d3 = new Date(now); d3.setDate(d3.getDate() - 1); d3.setHours(14, 30, 0, 0);
            const d4 = new Date(d3); d4.setHours(d4.getHours() + 1, 15);

            await firestoreService.addStatusLog({ branchName: name, status: 'Offline', dateTime: d1.toISOString(), remarks: '' });
            await firestoreService.addStatusLog({ branchName: name, status: 'Online', dateTime: d2.toISOString(), remarks: '' });
            await firestoreService.addStatusLog({ branchName: name, status: 'Offline', dateTime: d3.toISOString(), remarks: '' });
            await firestoreService.addStatusLog({ branchName: name, status: 'Online', dateTime: d4.toISOString(), remarks: '' });
        }
    }
}

// ==============================================================
//  DASHBOARD
// ==============================================================

function renderDashboard() {
    renderSummaryCards();
    renderQuickStatus();
    renderCharts();
    updateOfflineBadge();
}

function renderSummaryCards() {
    const online = branches.filter(b => b.currentStatus === 'Online').length;
    const offline = branches.filter(b => b.currentStatus === 'Offline').length;
    onlineCount.textContent = online;
    offlineCount.textContent = offline;
    activeOutages.textContent = offline;

    calculateTotalMonthlyDowntime().then(total => {
        totalDowntime.textContent = formatDuration(total);
    });
}

async function calculateTotalMonthlyDowntime() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const startMs = startOfMonth.getTime();
    const endMs = endOfMonth.getTime();

    const monthLogs = allLogs.filter(log => {
        const t = log.dateTime?.toDate?.()?.getTime() || new Date(log.dateTime).getTime();
        return t >= startMs && t <= endMs;
    });

    const branchLogMap = {};
    for (const log of monthLogs) {
        const name = log.branchName;
        if (!branchLogMap[name]) branchLogMap[name] = [];
        branchLogMap[name].push(log);
    }

    let totalMinutes = 0;
    for (const branchName of Object.keys(branchLogMap)) {
        totalMinutes += calculateDowntimeFromLogs(branchLogMap[branchName]);
    }
    return totalMinutes;
}

function calculateDowntimeFromLogs(logs) {
    if (!logs || logs.length < 2) return 0;
    const sorted = [...logs].sort((a, b) => {
        const aT = a.dateTime?.toDate?.()?.getTime() || new Date(a.dateTime).getTime();
        const bT = b.dateTime?.toDate?.()?.getTime() || new Date(b.dateTime).getTime();
        return aT - bT;
    });
    let total = 0, offlineStart = null;
    for (const log of sorted) {
        const d = log.dateTime?.toDate ? log.dateTime.toDate() : new Date(log.dateTime);
        if (log.status === 'Offline' && offlineStart === null) offlineStart = d;
        else if (log.status === 'Online' && offlineStart !== null) {
            total += getDurationMinutes(offlineStart, d);
            offlineStart = null;
        }
    }
    if (offlineStart !== null) total += getDurationMinutes(offlineStart, new Date());
    return total;
}

function renderQuickStatus() {
    if (branches.length === 0) {
        quickStatusList.innerHTML = '<div class="loading-spinner"><i class="fas fa-info-circle"></i> No branches.</div>';
        return;
    }
    quickStatusList.innerHTML = branches.map(b => `
        <div class="quick-status-item">
            <span class="quick-status-name">${escapeHTML(b.branchName)}</span>
            <span class="quick-status-dot ${b.currentStatus === 'Online' ? 'online' : 'offline'}"></span>
        </div>
    `).join('');
}

function renderCharts() { renderStatusChart(); renderTrendChart(); }

function renderStatusChart() {
    const ctx = document.getElementById('statusChart').getContext('2d');
    const online = branches.filter(b => b.currentStatus === 'Online').length;
    const offline = branches.filter(b => b.currentStatus === 'Offline').length;
    if (statusChart) { statusChart.data.datasets[0].data = [online, offline]; statusChart.update(); return; }
    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['Online', 'Offline'], datasets: [{ data: [online, offline], backgroundColor: ['#22c55e', '#ef4444'], borderColor: ['#1e293b', '#1e293b'], borderWidth: 3, hoverOffset: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 14, font: { family: 'Inter', size: 12 } } } } }
    });
}

async function renderTrendChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    const now = new Date();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dd = new Array(dim).fill(0);
    const labels = Array.from({ length: dim }, (_, i) => String(i + 1));
    const som = new Date(now.getFullYear(), now.getMonth(), 1);
    const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const startMs = som.getTime();
    const endMs = eom.getTime();

    const monthLogs = allLogs.filter(log => {
        const t = log.dateTime?.toDate?.()?.getTime() || new Date(log.dateTime).getTime();
        return t >= startMs && t <= endMs;
    });

    const branchLogMap = {};
    for (const log of monthLogs) {
        const name = log.branchName;
        if (!branchLogMap[name]) branchLogMap[name] = [];
        branchLogMap[name].push(log);
    }

    for (const branchName of Object.keys(branchLogMap)) {
        const logs = branchLogMap[branchName];
        if (logs.length >= 2) {
            const sorted = [...logs].sort((a, b) => {
                const aT = a.dateTime?.toDate?.()?.getTime() || new Date(a.dateTime).getTime();
                const bT = b.dateTime?.toDate?.()?.getTime() || new Date(b.dateTime).getTime();
                return aT - bT;
            });
            let os = null;
            for (const log of sorted) {
                const d = log.dateTime?.toDate ? log.dateTime.toDate() : new Date(log.dateTime);
                if (log.status === 'Offline' && os === null) os = d;
                else if (log.status === 'Online' && os !== null) { distributeDowntime(os, d, dd); os = null; }
            }
            if (os !== null) distributeDowntime(os, new Date(), dd);
        }
    }
    if (trendChart) { trendChart.data.datasets[0].data = dd; trendChart.update(); return; }
    trendChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Downtime (min)', data: dd, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3, pointBackgroundColor: '#ef4444', pointRadius: 3, borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } } }, scales: { x: { grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } }, title: { display: true, text: 'Day', color: '#64748b' } }, y: { grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } }, title: { display: true, text: 'Minutes', color: '#64748b' }, beginAtZero: true } } }
    });
}

function distributeDowntime(startDate, endDate, dailyArray) {
    let start = new Date(startDate);
    const end = new Date(endDate);
    while (start < end) {
        const idx = start.getDate() - 1;
        if (idx < 0 || idx >= dailyArray.length) break;
        const dayEnd = new Date(start); dayEnd.setHours(23, 59, 59, 999);
        if (end <= dayEnd) { dailyArray[idx] += getDurationMinutes(start, end); }
        else { dailyArray[idx] += getDurationMinutes(start, dayEnd); }
        start.setDate(start.getDate() + 1); start.setHours(0, 0, 0, 0);
    }
}

function updateOfflineBadge() {
    const offline = branches.filter(b => b.currentStatus === 'Offline').length;
    if (offline > 0) {
        offlineBadge.style.display = 'inline';
        offlineBadge.textContent = offline;
    } else {
        offlineBadge.style.display = 'none';
    }
}

// ==============================================================
//  BRANCH GROUPING & TABLES
// ==============================================================

function getBranchGroup(branchName) {
    const name = branchName.toLowerCase();
    if (name.startsWith('sm ')) return 'SM';
    if (name.startsWith('smdc')) return 'SMDC';
    if (name.startsWith('tagaytay')) return 'Tagaytay';
    if (name.includes('ortigas')) return 'Ortigas';
    return branchName;
}

let expandedGroups = {};

function renderBranchesTable() {
    const isAdmin = currentUserIsSuperAdmin();
    const searchTerm = searchInput.value.toLowerCase().trim();
    const filter = document.querySelector('.filter-btn[data-filter].active')?.dataset?.filter || 'all';
    const sortBy = sortSelect.value;
    const downtimeVal = downtimeFilter.value;
    const groupVal = groupFilter.value;

    let filtered = [...branches];
    if (searchTerm) filtered = filtered.filter(b => b.branchName.toLowerCase().includes(searchTerm));
    if (filter !== 'all') filtered = filtered.filter(b => b.currentStatus === filter);

    if (downtimeVal === 'has') filtered = filtered.filter(b => b.currentStatus === 'Offline' && b.currentDowntimeStart);
    else if (downtimeVal === 'none') filtered = filtered.filter(b => b.currentStatus !== 'Offline' || !b.currentDowntimeStart);
    else if (downtimeVal === 'gt1h') filtered = filtered.filter(b => getCurrentDowntimeMinutes(b) >= 60);
    else if (downtimeVal === 'gt6h') filtered = filtered.filter(b => getCurrentDowntimeMinutes(b) >= 360);
    else if (downtimeVal === 'gt24h') filtered = filtered.filter(b => getCurrentDowntimeMinutes(b) >= 1440);

    filtered.forEach(b => { b._group = getBranchGroup(b.branchName); });
    if (groupVal) filtered = filtered.filter(b => b._group === groupVal);

    filtered.sort((a, b) => {
        if (sortBy === 'group') { const g = a._group.localeCompare(b._group); if (g !== 0) return g; return a.branchName.localeCompare(b.branchName); }
        if (sortBy === 'branchName') return a.branchName.localeCompare(b.branchName);
        if (sortBy === 'currentStatus') return a.currentStatus.localeCompare(b.currentStatus);
        if (sortBy === 'lastUpdated') { const aT = a.lastUpdated?.toDate?.()?.getTime() || 0; const bT = b.lastUpdated?.toDate?.()?.getTime() || 0; return bT - aT; }
        if (sortBy === 'downtime') return getCurrentDowntimeMinutes(b) - getCurrentDowntimeMinutes(a);
        return 0;
    });

// ===== Pagination for the Branches table =====
    filteredBranches = filtered;
    const branchTotalPages = Math.ceil(filteredBranches.length / ITEMS_PER_PAGE) || 1;
    if (branchPage > branchTotalPages) branchPage = branchTotalPages;
    if (branchPage < 1) branchPage = 1;
    const branchStart = (branchPage - 1) * ITEMS_PER_PAGE;
    const branchEnd = Math.min(branchStart + ITEMS_PER_PAGE, filteredBranches.length);
    filtered = filteredBranches.slice(branchStart, branchEnd);

    if (filtered.length === 0) {
        branchesTableBody.innerHTML = `<tr><td colspan="5" class="empty-state"><i class="fas fa-search"></i><p>No branches match.</p></td></tr>`;
        renderBranchPagination();
        return;
    }

    if (sortBy === 'group') {
        const groups = {};
        filtered.forEach(b => { if (!groups[b._group]) groups[b._group] = []; groups[b._group].push(b); });
        let html = '';
        const groupKeys = Object.keys(groups).sort();
        groupKeys.forEach(groupName => {
            const members = groups[groupName];
            const online = members.filter(m => m.currentStatus === 'Online').length;
            const offline = members.filter(m => m.currentStatus === 'Offline').length;
            const isExpanded = expandedGroups[groupName] !== false;
            const arrowIcon = isExpanded ? 'fa-chevron-down' : 'fa-chevron-right';
            const displayStyle = isExpanded ? '' : 'style="display:none;"';
            const totalDT = members.reduce((sum, m) => sum + getCurrentDowntimeMinutes(m), 0);

            html += `<tr class="group-header-row" data-group="${escapeHTML(groupName)}">
                <td colspan="5">
                    <span class="group-toggle"><i class="fas ${arrowIcon}"></i></span>
                    <strong class="group-name">${escapeHTML(groupName)}</strong>
                    <span class="group-stats">
                        <span class="group-count">${members.length}</span>
                        <span class="group-online">${online} Online</span>
                        <span class="group-offline">${offline} Offline</span>
                        ${totalDT > 0 ? `<span class="group-downtime">${formatDuration(totalDT)}</span>` : ''}
                    </span>
                </td>
            </tr>`;

            members.forEach(b => {
                const sc = b.currentStatus === 'Online' ? 'online' : 'offline';
                const lu = b.lastUpdated?.toDate ? formatTime(b.lastUpdated.toDate()) : '\u2014';
                const dt = getCurrentDowntimeText(b);
                const rc = b.currentStatus === 'Offline' ? 'row-offline' : 'row-online';
                html += `<tr class="child-row ${rc}" data-group="${escapeHTML(groupName)}" ${displayStyle}>
                    <td><span class="child-indent"></span><strong>${escapeHTML(b.branchName)}</strong></td>
                    <td><span class="status-badge ${sc}">${escapeHTML(b.currentStatus)}</span></td>
                    <td>${lu}</td>
                    <td>${dt}</td>
                    <td class="actions-cell">
                        <button class="btn-view" data-tooltip="Details" data-branch="${escapeHTML(b.branchName)}"><i class="fas fa-eye"></i></button>
                        ${isAdmin ? `<button class="btn-remove" data-tooltip="Remove" data-branch="${escapeHTML(b.branchName)}"><i class="fas fa-trash-alt"></i></button>` : ''}
                    </td>
                </tr>`;
            });
        });
        branchesTableBody.innerHTML = html;

        branchesTableBody.querySelectorAll('.group-header-row').forEach(row => {
            row.addEventListener('click', () => {
                expandedGroups[row.dataset.group] = expandedGroups[row.dataset.group] === false ? true : false;
                renderBranchesTable();
            });
        });
    } else {
        branchesTableBody.innerHTML = filtered.map(b => {
            const sc = b.currentStatus === 'Online' ? 'online' : 'offline';
            const lu = b.lastUpdated?.toDate ? formatTime(b.lastUpdated.toDate()) : '\u2014';
            const dt = getCurrentDowntimeText(b);
            const rc = b.currentStatus === 'Offline' ? 'row-offline' : 'row-online';
            return `<tr class="${rc}">
                <td><strong>${escapeHTML(b.branchName)}</strong></td>
                <td><span class="status-badge ${sc}">${escapeHTML(b.currentStatus)}</span></td>
                <td>${lu}</td>
                <td>${dt}</td>
                <td class="actions-cell">
                    <button class="btn-view" data-tooltip="Details" data-branch="${escapeHTML(b.branchName)}"><i class="fas fa-eye"></i></button>
                    ${isAdmin ? `<button class="btn-remove" data-tooltip="Remove" data-branch="${escapeHTML(b.branchName)}"><i class="fas fa-trash-alt"></i></button>` : ''}
                </td>
            </tr>`;
        }).join('');
    }

    branchesTableBody.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', () => openViewModal(btn.dataset.branch));
    });

// Use event delegation for remove buttons to avoid inline onclick issues
    branchesTableBody.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = btn.dataset.branch;
            if (name) window.confirmRemoveBranch(name);
        });
    });

    // ===== Render the Branches-table pagination controls =====
    renderBranchPagination();
}

// ===== Pagination controls for the Branches table =====
function renderBranchPagination() {
    const el = document.getElementById('branchPagination');
    if (!el) return;
    const totalItems = filteredBranches.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

    if (totalPages <= 1) {
        el.innerHTML = `<span class="page-info">Showing ${totalItems} branches</span>`;
        return;
    }

    let html = `<button onclick="goToBranchPage(${branchPage - 1})" ${branchPage <= 1 ? 'disabled' : ''}>\u00AB Prev</button>`;
    const maxVisiblePages = 5;
    let startPage = Math.max(1, branchPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) startPage = Math.max(1, endPage - maxVisiblePages + 1);

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === branchPage ? 'active' : ''}" onclick="goToBranchPage(${i})">${i}</button>`;
    }

    html += `<button onclick="goToBranchPage(${branchPage + 1})" ${branchPage >= totalPages ? 'disabled' : ''}>Next \u00BB</button>`;
    html += `<span class="page-info">Page ${branchPage} of ${totalPages} (${totalItems} branches)</span>`;
    el.innerHTML = html;
}

window.goToBranchPage = function(page) {
    branchPage = page;
    renderBranchesTable();
};

// ==============================================================
//  EDIT / DELETE HISTORY & REMOVE BRANCH (FAST OPTIMISTIC UPDATES)
// ==============================================================

const editHistoryModal = $('#editHistoryModal');
const closeEditHistoryModal = $('#closeEditHistoryModal');
const cancelEditHistory = $('#cancelEditHistory');
const editHistoryForm = $('#editHistoryForm');
const editHistoryId = $('#editHistoryId');
const editHistoryBranch = $('#editHistoryBranch');
const editHistoryStatus = $('#editHistoryStatus');
const editHistoryDate = $('#editHistoryDate');
const editHistoryTime = $('#editHistoryTime');
const editHistoryRemarks = $('#editHistoryRemarks');

window.openEditHistoryModal = function(logId) {
    if (!currentUserIsSuperAdmin()) { console.log('Permission denied.'); return; }
    const log = allLogs.find(l => l.id === logId);
    if (!log) { console.log('History record not found.'); return; }

    editHistoryId.value = logId;
    const d = log.dateTime?.toDate ? log.dateTime.toDate() : new Date(log.dateTime);

    editHistoryBranch.innerHTML = '<option value="">\u2014 Select Branch \u2014</option>' +
        branches.map(b => `<option value="${escapeHTML(b.branchName)}">${escapeHTML(b.branchName)}</option>`).join('');
    editHistoryBranch.value = log.branchName || '';

    editHistoryStatus.value = log.status || '';
    editHistoryDate.value = toISODate(d);
    editHistoryTime.value = toISOTime(d);
    editHistoryRemarks.value = log.remarks || '';
    
    if (editHistoryModal) editHistoryModal.classList.add('active');
};

if (closeEditHistoryModal) closeEditHistoryModal.addEventListener('click', () => editHistoryModal.classList.remove('active'));
if (cancelEditHistory) cancelEditHistory.addEventListener('click', () => editHistoryModal.classList.remove('active'));

if (editHistoryForm) {
    editHistoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const logId = editHistoryId.value;
        const branchName = editHistoryBranch.value;
        const status = editHistoryStatus.value;
        const dateVal = editHistoryDate.value;
        const timeVal = editHistoryTime.value;
        const remarks = editHistoryRemarks.value.trim();

        if (!branchName || !status || !dateVal || !timeVal) {
            console.log('Please fill out all required fields.');
            return;
        }

        const dateTime = new Date(`${dateVal}T${timeVal}:00`);
        
        const index = allLogs.findIndex(l => l.id === logId);
        let previousLogState = index !== -1 ? { ...allLogs[index] } : null;
        if (index !== -1) {
            allLogs[index] = {
                ...allLogs[index],
                branchName,
                status,
                dateTime: firebase.firestore.Timestamp.fromDate(dateTime),
                remarks
            };
        }

        console.log('History record updated successfully.');
        if (editHistoryModal) editHistoryModal.classList.remove('active');
        renderHistory();
        renderDashboard();

        try {
            await firestoreService.updateStatusLog(logId, {
                branchName,
                status,
                dateTime: dateTime.toISOString(),
                remarks
            });
            loadBranchData().then(() => {
                renderDashboard();
                renderBranchesTable();
            });
        } catch (error) {
            console.error('Edit history error:', error);
            console.log('Failed to update record on server.');
            if (index !== -1 && previousLogState) {
                allLogs[index] = previousLogState;
            }
            loadBranchData().then(() => reRenderAll());
        }
    });
}

window.deleteHistoryLog = async function(logId) {
    if (!currentUserIsSuperAdmin()) { console.log('Permission denied.'); return; }
    const confirmed = await showConfirmDialog({
        title: 'Delete History Record',
        message: 'Are you sure you want to delete this history record?',
        confirmText: 'Delete',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmed) return;
    
    const logIndex = allLogs.findIndex(l => l.id === logId);
    const deletedLog = logIndex !== -1 ? allLogs[logIndex] : null;
    allLogs = allLogs.filter(l => l.id !== logId);
    
    console.log('History record deleted.');
    renderHistory();
    renderDashboard();

    try {
        await firestoreService.deleteStatusLog(logId);
        loadBranchData().then(() => {
            renderDashboard();
            renderBranchesTable();
        });
    } catch (error) {
        console.error('Delete history error:', error);
        console.log('Failed to delete record on server.');
        if (deletedLog) {
            allLogs.push(deletedLog);
        }
        loadBranchData().then(() => reRenderAll());
    }
};

window.confirmRemoveBranch = async function(name) {
    const confirmed = await showConfirmDialog({
        title: 'Remove Branch',
        message: `Remove <strong>${escapeHTML(name)}</strong>?<br>History logs will be kept.`,
        confirmText: 'Remove',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmed) return;

    const removedBranchIndex = branches.findIndex(b => b.branchName === name);
    const removedBranch = removedBranchIndex !== -1 ? branches[removedBranchIndex] : null;
    const affectedLogs = allLogs.filter(l => l.branchName === name);
    
    // Immediate state slice update
    branches = branches.filter(b => b.branchName !== name);
    allLogs = allLogs.filter(l => l.branchName !== name);

    renderDashboard();
    renderBranchesTable();
    renderHistory();
    populateHistoryBranchFilter();
    populateGroupFilter();
    populateTicketBranchFilter();
    populateSubmitBranchSelect();

    try {
        await firestoreService.deleteBranch(name);
    } catch (e) {
        console.error('Remove branch error:', e);
        console.log('Failed to remove on server.');
        if (removedBranch) branches.push(removedBranch);
        allLogs = allLogs.concat(affectedLogs);
        loadBranchData().then(() => reRenderAll());
    }
};

// ==============================================================
//  HISTORY
// ==============================================================

function renderHistory() {
    const searchTerm = historySearch.value.toLowerCase().trim();
    const filter = document.querySelector('.filter-btn[data-history-filter].active')?.dataset?.historyFilter || 'all';
    const branchF = historyBranchFilter.value;
    const dateFrom = historyDateFrom.value;
    const dateTo = historyDateTo.value;

    let filtered = [...allLogs];
    if (searchTerm) filtered = filtered.filter(log => log.branchName.toLowerCase().includes(searchTerm) || (log.remarks || '').toLowerCase().includes(searchTerm));
    if (filter !== 'all') filtered = filtered.filter(log => log.status === filter);
    if (branchF) filtered = filtered.filter(log => log.branchName === branchF);
    if (dateFrom) { const from = new Date(dateFrom + 'T00:00:00'); filtered = filtered.filter(log => { const d = log.dateTime?.toDate ? log.dateTime.toDate() : new Date(log.dateTime); return d >= from; }); }
    if (dateTo) { const to = new Date(dateTo + 'T23:59:59'); filtered = filtered.filter(log => { const d = log.dateTime?.toDate ? log.dateTime.toDate() : new Date(log.dateTime); return d <= to; }); }

    if (filtered.length === 0) {
        historyTableBody.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fas fa-history"></i><p>No records found.</p></td></tr>`;
        return;
    }

    // ===== Superadmin-only Edit/Delete buttons =====
    const isAdmin = currentUserIsSuperAdmin();
    historyTableBody.innerHTML = filtered.map(log => {
        const d = log.dateTime?.toDate ? log.dateTime.toDate() : new Date(log.dateTime);
        const sc = log.status === 'Online' ? 'online' : 'offline';
        const logId = log.id || '';
        const actionsHTML = isAdmin ? `
                <div class="action-group">
                    <button class="history-action-btn edit-hist" data-logid="${escapeHTML(logId)}" data-tooltip="Edit" onclick="window.openEditHistoryModal('${escapeHTML(logId)}')"><i class="fas fa-pen"></i></button>
                    <button class="history-action-btn delete-hist" data-logid="${escapeHTML(logId)}" data-tooltip="Delete" onclick="window.deleteHistoryLog('${escapeHTML(logId)}')"><i class="fas fa-trash"></i></button>
                </div>
            ` : '\u2014';
        return `<tr>
            <td>${formatDate(d)}</td>
            <td>${formatTime(d)}</td>
            <td><strong>${escapeHTML(log.branchName)}</strong></td>
            <td><span class="status-badge ${sc}">${escapeHTML(log.status)}</span></td>
            <td>${escapeHTML(log.remarks || '\u2014')}</td>
            <td>${actionsHTML}</td>
        </tr>`;
    }).join('');
}

// ==============================================================
//  POPULATE DROPDOWNS
// ==============================================================

function populateHistoryBranchFilter() {
    historyBranchFilter.innerHTML = '<option value="">All Branches</option>' +
        branches.map(b => `<option value="${escapeHTML(b.branchName)}">${escapeHTML(b.branchName)}</option>`).join('');
}

function populateGroupFilter() {
    const groupSet = new Set();
    branches.forEach(b => groupSet.add(getBranchGroup(b.branchName)));
    const groups = Array.from(groupSet).sort();
    groupFilter.innerHTML = '<option value="">All Groups</option>' + groups.map(g => `<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join('');
}

function populateTicketBranchFilter() {
    ticketBranchFilter.innerHTML = '<option value="all">All Branches</option>' +
        branches.map(b => `<option value="${escapeHTML(b.branchName)}">${escapeHTML(b.branchName)}</option>`).join('');
}

function populateSubmitBranchSelect() {
    if (!branchSelectTicket) return;
    branchSelectTicket.innerHTML = '<option value="">Select Branch</option>' +
        branches.map(b => `<option value="${escapeHTML(b.branchName)}">${escapeHTML(b.branchName)}</option>`).join('');
}

function populateBranchSelect() {
    branchSelect.innerHTML = '<option value="">\u2014 Select Branch \u2014</option>' +
        branches.map(b => `<option value="${escapeHTML(b.branchName)}">${escapeHTML(b.branchName)}</option>`).join('');
}

// ==============================================================
//  ADD STATUS MODAL
// ==============================================================

function openAddModal() {
    populateBranchSelect();
    setDefaultDateTime();
    statusSelect.value = '';
    remarksInput.value = '';
    validationWarning.style.display = 'none';
    newBranchGroup.style.display = 'none';
    newBranchInput.value = '';
    // Reset segmented buttons
    const segBtns = statusSegmentedGroup.querySelectorAll('.segmented-btn');
    segBtns.forEach(btn => btn.classList.remove('active'));
    addModal.classList.add('active');
}

function closeAddModalFn() { addModal.classList.remove('active'); }

btnAddStatus.addEventListener('click', openAddModal);
closeAddModal.addEventListener('click', closeAddModalFn);
cancelAdd.addEventListener('click', closeAddModalFn);
addModal.addEventListener('click', (e) => { if (e.target === addModal) closeAddModalFn(); });

// Segmented button status selection
if (statusSegmentedGroup) {
    statusSegmentedGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.segmented-btn');
        if (!btn) return;
        // Deactivate all
        statusSegmentedGroup.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
        // Activate clicked
        btn.classList.add('active');
        // Update hidden input
        statusSelect.value = btn.dataset.status;
        // Hide validation warning if shown
        if (validationWarning) validationWarning.style.display = 'none';
    });
}

btnAddBranch.addEventListener('click', () => {
    const isNowVisible = newBranchGroup.style.display === 'none';
    newBranchGroup.style.display = isNowVisible ? 'block' : 'none';
    if (isNowVisible) {
        branchSelect.closest('.form-group').style.display = 'none';
        branchSelect.removeAttribute('required');
        newBranchInput.focus();
        branchSelect.value = '';
    } else {
        branchSelect.closest('.form-group').style.display = '';
        branchSelect.setAttribute('required', '');
        newBranchInput.value = '';
    }
});


newBranchInput.addEventListener('input', () => {
    const val = newBranchInput.value.trim();
    if (val) {
        const existing = branches.find(b => b.branchName.toLowerCase() === val.toLowerCase());
        if (existing) branchSelect.value = existing.branchName;
    }
});

function reRenderAll() {
    renderDashboard();
    renderBranchesTable();
    renderHistory();
    populateHistoryBranchFilter();
    populateGroupFilter();
    populateTicketBranchFilter();
    populateSubmitBranchSelect();
    populateBranchSelect();
}

async function handleAddStatus(e) {
    e.preventDefault();
    let branchName = branchSelect.value;
    const newName = newBranchInput.value.trim();
    if (!branchName && newName) branchName = newName;
    const status = statusSelect.value;
    const dateVal = dateInput.value;
    const timeVal = timeInput.value;
    const remarks = remarksInput.value.trim();

    if (!branchName || !status || !dateVal || !timeVal) {
        console.log('Please fill in all required fields.');
        return;
    }

    const dateTime = new Date(`${dateVal}T${timeVal}:00`);
    try {
        await firestoreService.addStatusLog({ branchName, status, dateTime: dateTime.toISOString(), remarks });
        const ts = firebase.firestore.Timestamp.fromDate(dateTime);
        await firestoreService.setBranch(branchName, {
            currentStatus: status,
            lastUpdated: ts,
            currentDowntimeStart: status === 'Offline' ? ts : null,
            remarks
        });

        // Optimistic local update \u2014 no full reload
        const newLog = {
            id: 'local-' + Date.now(),
            branchName, status,
            dateTime: ts,
            remarks: remarks || ''
        };
        allLogs.unshift(newLog);

        const branch = branches.find(b => b.branchName === branchName);
        if (branch) {
            branch.currentStatus = status;
            branch.lastUpdated = ts;
            branch.remarks = remarks || '';
            branch.currentDowntimeStart = status === 'Offline' ? ts : null;
        } else {
            branches.push({
                branchName, currentStatus: status, lastUpdated: ts,
                currentDowntimeStart: status === 'Offline' ? ts : null,
                remarks: remarks || ''
            });
            branches.sort((a, b) => (a.branchName || '').localeCompare(b.branchName || ''));
        }

        reRenderAll();
        closeAddModalFn();
    } catch (error) {
        console.error(error);
        console.log('Failed to save. Please try again.');
    }
}

addForm.addEventListener('submit', handleAddStatus);

// ==============================================================
//  VIEW BRANCH MODAL
// ==============================================================

async function openViewModal(branchName) {
    const branch = branches.find(b => b.branchName === branchName);
    if (!branch) { console.log('Branch not found.'); return; }

    currentViewBranch = branchName;
    captureMainState({ tab: getActiveMainTab() || 'branches', modal: 'branch', id: branchName });
    viewBranchName.textContent = branchName;

    const sc = branch.currentStatus === 'Online' ? 'online' : 'offline';
    viewCurrentStatus.innerHTML = `<span class="status-badge ${sc}">${escapeHTML(branch.currentStatus)}</span>`;
    viewLastUpdated.textContent = branch.lastUpdated?.toDate ? `${formatDate(branch.lastUpdated.toDate())} ${formatTime(branch.lastUpdated.toDate())}` : '\u2014';
    viewRemarks.textContent = branch.remarks || '\u2014';
    viewDowntime.textContent = getCurrentDowntimeText(branch);

    await loadMonthlyStats(branchName);
    await loadViewHistory(branchName);
    viewModal.classList.add('active');
}

function closeViewModalFn() { viewModal.classList.remove('active'); currentViewBranch = null; try { clearMainModalCtx(); } catch (e) { /* ignore */ } }

closeViewModal.addEventListener('click', closeViewModalFn);
viewModal.addEventListener('click', (e) => { if (e.target === viewModal) closeViewModalFn(); });

async function loadMonthlyStats(branchName) {
    try {
        const now = new Date();
        const som = new Date(now.getFullYear(), now.getMonth(), 1);
        const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const logs = await firestoreService.getBranchLogsInRange(branchName, som, eom);

        let total = 0, outages = 0, longest = 0, os = null;
        for (const log of logs) {
            const d = log.dateTime?.toDate ? log.dateTime.toDate() : new Date(log.dateTime);
            if (log.status === 'Offline' && os === null) os = d;
            else if (log.status === 'Online' && os !== null) {
                const dur = getDurationMinutes(os, d); total += dur; outages++; if (dur > longest) longest = dur; os = null;
            }
        }
        if (os !== null) { const dur = getDurationMinutes(os, new Date()); total += dur; outages++; if (dur > longest) longest = dur; }

        const tmm = (eom - som) / (1000 * 60);
        const avail = tmm > 0 ? ((tmm - total) / tmm) * 100 : 100;

        statOutages.textContent = outages;
        statTotalDowntime.textContent = formatDuration(total);
        statLongestOutage.textContent = formatDuration(longest);
        statAvgOutage.textContent = outages > 0 ? formatDuration(total / outages) : '0m';
        statAvailability.textContent = `${Math.round(avail * 100) / 100}%`;
    } catch (e) {
        statOutages.textContent = statTotalDowntime.textContent = statLongestOutage.textContent = statAvgOutage.textContent = statAvailability.textContent = '\u2014';
    }
}

async function loadViewHistory(branchName) {
    try {
        const logs = await firestoreService.getBranchLogs(branchName);
        if (logs.length === 0) { viewHistoryBody.innerHTML = `<tr><td colspan="4" class="empty-state">No history.</td></tr>`; return; }
        viewHistoryBody.innerHTML = logs.map(log => {
            const d = log.dateTime?.toDate ? log.dateTime.toDate() : new Date(log.dateTime);
            const sc = log.status === 'Online' ? 'online' : 'offline';
            return `<tr><td>${formatDate(d)}</td><td>${formatTime(d)}</td><td><span class="status-badge ${sc}">${escapeHTML(log.status)}</span></td><td>${escapeHTML(log.remarks || '\u2014')}</td></tr>`;
        }).join('');
    } catch (e) { viewHistoryBody.innerHTML = `<tr><td colspan="4" class="empty-state">Failed to load.</td></tr>`; }
}

// ==============================================================
//  TICKET SYSTEM - REAL-TIME LISTENER
// ==============================================================

function setupTicketListener() {
    let isFirstSnapshot = true;

    // ===== Real Desktop Notifications (like YouTube/Slack) =====
    if (typeof window.initDesktopNotifications === 'function') {
        window.initDesktopNotifications();
    }

    firestoreService.listenTickets((tickets, changes) => {
        if (isFirstSnapshot) {
            if (tickets.length > 0) {
                allTickets = tickets;
                filterTickets();
                updateTicketDashboard();
                updatePendingBadge();
                updateApprovalsBadge();
                // ===== Live approval queue: render from initial snapshot =====
                applyApprovalFilters(false);
            } else if (allTickets.length > 0) {
                filterTickets();
                updateTicketDashboard();
                updatePendingBadge();
                updateApprovalsBadge();
                applyApprovalFilters(false);
            }
            isFirstSnapshot = false;
            return;
        }
        
        const changeArray = changes || [];
        if (changeArray.length === 0) return;
        
        let hasChanges = false;
        changeArray.forEach(change => {
            if (change.type === 'added') {
                const ticket = { id: change.doc.id, ...change.doc.data() };
                const exists = allTickets.some(t => t.id === ticket.id);
                if (!exists) {
                    allTickets.push(ticket);
                    hasChanges = true;
                    const msg = `New ticket: ${ticket.ticketNumber || change.doc.id} from ${ticket.branch || 'Unknown'}`;
                    showNotificationBar(msg);
                    console.log(msg);

                    // ===== Real Desktop Notification (Windows Action Center, like YouTube) =====
                    if (typeof window.notifyNewTicket === 'function') {
                        window.notifyNewTicket(ticket);
                    }
                }
            } else if (change.type === 'modified') {
                const ticket = { id: change.doc.id, ...change.doc.data() };
                const idx = allTickets.findIndex(t => t.id === ticket.id);
                if (idx !== -1) {
                    allTickets[idx] = ticket;
                    hasChanges = true;
                }
            } else if (change.type === 'removed') {
                allTickets = allTickets.filter(t => t.id !== change.doc.id);
                hasChanges = true;
            }
        });
        
        if (hasChanges) {
            filterTickets();
            updateTicketDashboard();
            updatePendingBadge();
            updateApprovalsBadge();
            // ===== LIVE APPROVAL QUEUE: re-filter + re-render the Approvals tab
            //       using the updated ticket state. When the superadmin is on the
            //       Approvals tab, new submissions appear instantly; if they are on
            //       another tab, the badge updates and the list is ready when they
            //       switch over. =====
            applyApprovalFilters(false);
        }
    }, (error) => {
        console.error('Ticket listener error:', error);
    });
}

// ==============================================================
//  SEED SAMPLE TICKETS
// ==============================================================

async function seedSampleTickets() {
    const sampleTickets = [
        { branch: 'Banawe', name: 'Juan Dela Cruz', position: 'Store Manager', contact: '09171234567', email: 'juan@example.com', datetime: '02/15/2025 0800H', location: 'Cashier Area', incident: 'Tip Pocketing', description: 'Customer reported missing wallet at cashier area. Review CCTV footage required.', priority: 'High' },
            { branch: 'MOA', name: 'Maria Santos', position: 'Supervisor', contact: '09179876543', email: 'maria@example.com', datetime: '02/15/2025 0930H', location: 'Dining Area', incident: 'Overcharge Discrepancy', description: 'Customer complained about being overcharged PHP 250 on their bill. Need to check POS records.', priority: 'Low' }
    ];

    for (const ticket of sampleTickets) {
        try {
            const ticketID = await firestoreService.generateTicketNumber(ticket.branch);
            const createdDate = new Date();
            
            await firestoreService.setTicket(ticketID, {
                ticketNumber: ticketID,
                branch: ticket.branch,
                name: ticket.name,
                position: ticket.position,
                contact: ticket.contact,
                email: ticket.email,
                datetime: ticket.datetime,
                location: ticket.location,
                incident: ticket.incident,
                description: ticket.description,
                priority: ticket.priority || 'Low',
                status: 'Pending',
                createdAt: firebase.firestore.Timestamp.fromDate(createdDate)
            });
        } catch (e) {
            console.error('Error seeding ticket:', e);
        }
    }
}

// ==============================================================
//  NOTIFICATION BAR & DASHBOARD
// ==============================================================

function showNotificationBar(message) {
    const bar = document.getElementById('notificationBar');
    const msg = document.getElementById('notificationMsg');
    if (bar && msg) {
        msg.innerHTML = '<i class="fas fa-ticket-alt"></i> ' + escapeHTML(message);
        bar.classList.add('visible');
        setTimeout(() => { bar.classList.remove('visible'); }, 10000);
    }
}

window.dismissNotification = function() {
    const bar = document.getElementById('notificationBar');
    if (bar) bar.classList.remove('visible');
};

function updateTicketDashboard() {
    const total = allTickets.length;
    const pending = allTickets.filter(t => (t.status || 'Pending') === 'Pending').length;
    const progress = allTickets.filter(t => t.status === 'In Progress').length;
    // Only fully approved resolutions count as "Resolved" on the dashboard;
    // pending-approval tickets are NOT resolved yet, and For Revision is its own state.
    const resolved = allTickets.filter(t => isApprovedTicket(t)).length;

    if (totalTickets) totalTickets.textContent = total;
    if (pendingTickets) pendingTickets.textContent = pending;
    if (progressTickets) progressTickets.textContent = progress;
    if (resolvedTickets) resolvedTickets.textContent = resolved;
}

function updatePendingBadge() {
    // Pending badge covers new tickets AND tickets sent back for revision
    const pending = allTickets.filter(t => {
        const s = t.status || 'Pending';
        return s === 'Pending' || s === 'For Revision';
    }).length;
    if (pending > 0) {
        pendingBadge.style.display = 'inline';
        pendingBadge.textContent = pending;
    } else {
        pendingBadge.style.display = 'none';
    }
}

function updateApprovalsBadge() {
    if (!approvalsBadge) return;
    const count = allTickets.filter(t => isPendingApproval(t)).length;
    if (count > 0) {
        approvalsBadge.style.display = 'inline';
        approvalsBadge.textContent = count;
    } else {
        approvalsBadge.style.display = 'none';
    }
}

// ==============================================================
//  TICKET FILTERS & DISPLAY
// ==============================================================

function filterTickets() {
    const keyword = ticketSearch ? ticketSearch.value.trim().toLowerCase() : '';
    const selectedStatus = ticketStatusFilter ? ticketStatusFilter.value : 'all';
    const selectedPriority = ticketPriorityFilter ? ticketPriorityFilter.value : 'all';
    const selectedBranch = ticketBranchFilter ? ticketBranchFilter.value : 'all';

    filteredTickets = allTickets.filter(ticket => {
        const searchable = `${ticket.ticketNumber || ''} ${ticket.branch || ''} ${ticket.name || ''} ${ticket.incident || ''} ${ticket.description || ''}`.toLowerCase();
        const keywordMatch = !keyword || searchable.includes(keyword);
        const statusMatch = selectedStatus === 'all' || getDisplayStatus(ticket) === selectedStatus;
        const priorityMatch = selectedPriority === 'all' || (ticket.priority || 'Low') === selectedPriority;
        const branchMatch = selectedBranch === 'all' || ticket.branch === selectedBranch;

        // ===== Approved/resolved tickets =====
        // Fully approved "Resolved" tickets are hidden from the default active
        // ticket list, but operators can still audit them by selecting the
        // "Resolved" status filter in the Tickets tab.
        if (isApprovedTicket(ticket)) {
            return selectedStatus === 'Resolved' && keywordMatch && priorityMatch && branchMatch;
        }

        return keywordMatch && statusMatch && priorityMatch && branchMatch;
    });

    currentPage = 1;
    renderPagination();
}

function displayTickets(tickets) {
    if (!ticketList) return;
    ticketList.innerHTML = '';

    if (tickets.length === 0) {
        ticketList.innerHTML = `<tr><td colspan="8" class="empty-state"><i class="fas fa-ticket-alt"></i><p>No tickets found.</p></td></tr>`;
        return;
    }

    // ===== Role-based permissions: Edit/Delete buttons are superadmin-only =====
    const isAdmin = currentUserIsSuperAdmin();

    const statusOrder = { "Pending": 1, "In Progress": 2, "Resolved": 3 };
    const sortedTickets = [...tickets].sort((a, b) => {
        const orderA = statusOrder[a.status || 'Pending'] || 3;
        const orderB = statusOrder[b.status || 'Pending'] || 3;
        if (orderA !== orderB) return orderA - orderB;
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
    });

    sortedTickets.forEach(ticket => {
        const status = ticket.status || 'Pending';
        const priority = ticket.priority || 'Low';
        const dotClass = priority.toLowerCase();

        let actionHTML = '';
        // ===== Superadmin-only Edit/Delete buttons (operators keep workflow actions) =====
        const adminEditBtn = isAdmin
            ? `<button class="action-btn edit" data-tooltip="Edit" onclick="window.openEditTicket('${ticket.id}')">\u270E</button>`
            : '';
        const adminDeleteBtn = isAdmin
            ? `<button class="action-btn delete-action" data-tooltip="Delete" onclick="window.deleteTicket('${ticket.id}')">\uD83D\uDDD1</button>`
            : '';
        if (status === 'Pending') {
            actionHTML = `<div class="action-group">
                <button class="action-btn start" data-tooltip="Start" onclick="window.startTicket('${ticket.id}')">\u25B6</button>
                ${adminEditBtn}
                ${adminDeleteBtn}
            </div>`;
        } else if (status === 'In Progress') {
            actionHTML = `<div class="action-group">
                <button class="action-btn resolve" data-tooltip="Resolve" onclick="window.resolveTicket('${ticket.id}')">\u2713</button>
                ${adminEditBtn}
                ${adminDeleteBtn}
            </div>`;
        } else if (status === 'For Revision') {
            // ===== For Revision: agent must review the rejection reason and
            //       resubmit a new resolution through the revise modal =====
            actionHTML = `<div class="action-group">
                <button class="action-btn resolve" data-tooltip="Revise & Resubmit Resolution" onclick="window.reviseTicket('${ticket.id}')"><i class="fas fa-redo-alt"></i></button>
                ${adminEditBtn}
                ${adminDeleteBtn}
            </div>`;
        } else if (status === 'Resolved') {
            // Ticket is already resolved — no action needed
            actionHTML = '';
        } else {
            actionHTML = `<div class="action-group">
                <button class="action-btn resolve" data-tooltip="Resolve" onclick="window.resolveTicket('${ticket.id}')">✓</button>
                ${adminEditBtn}
                ${adminDeleteBtn}
            </div>`;
        }

        const displayStatus = getDisplayStatus(ticket);
        const createdDate = ticket.createdAt?.toDate ? formatDateTime(ticket.createdAt.toDate()) : (ticket.createdAt || '-');
        const statusClass = displayStatus.toLowerCase().replace(/\s+/g, '-');

        const row = document.createElement('tr');
        // ===== Desktop Notification Feature: Add data-ticket-id for scroll targeting =====
        row.setAttribute('data-ticket-id', ticket.id);
        row.innerHTML = `
            <td class="checkbox-cell"><input type="checkbox" class="ticket-checkbox" value="${ticket.id}" onchange="updateBulkBar()"></td>
            <td><span class="priority-dot"><span class="dot ${dotClass}"></span><span class="ticket-link" onclick="window.openTicketModal('${ticket.id}')">${escapeHTML(ticket.ticketNumber || ticket.id)}</span></span></td>
            <td>${createdDate}</td>
            <td>${escapeHTML(ticket.branch || '')}</td>
            <td>${escapeHTML(ticket.name || '')}</td>
            <td>${escapeHTML(ticket.incident || '')}</td>
            <td><span class="status-badge ${statusClass}">${escapeHTML(displayStatus)}</span></td>
            <td>${actionHTML}</td>
        `;
        ticketList.appendChild(row);
        // ===== Click anywhere on the row (except buttons/checkboxes/links) opens the ticket =====
        row.addEventListener('click', function(e) {
            if (e.target.closest('button, input, a, .action-group, .checkbox-cell, .priority-dot')) return;
            window.openTicketModal(ticket.id);
        });
    });
}

function getApprovalStatusText(ticket) {
    if (isPendingApproval(ticket)) return 'Pending Approval';
    if (isApprovedTicket(ticket)) return 'Approved';
    if (isRejectedTicket(ticket)) return 'For Revision';
    const s = ticket.status || 'Pending';
    if (s === 'Pending') return 'Not Submitted';
    if (s === 'In Progress') return 'In Progress';
    return s;
}

function populateApprovalBranchFilter() {
    if (!approvalBranchFilter) return;
    approvalBranchFilter.innerHTML = '<option value="all">All Branches</option>' +
        branches.map(b => `<option value="${escapeHTML(b.branchName)}">${escapeHTML(b.branchName)}</option>`).join('');
}

/**
 * Only tickets that have actually been submitted for approval appear in the
 * Approvals tab. Tickets still sitting as "Pending" or "In Progress" (i.e. the
 * operator has not submitted a resolution) are hidden entirely.
 */
function isSubmittedForApproval(ticket) {
    return isPendingApproval(ticket) || isApprovedTicket(ticket) || isRejectedTicket(ticket);
}

/**
 * Re-run the approval tab filters over the current `allTickets` state.
 * When `resetPage` is true (manual filter change / tab open) pagination resets
 * to page 1. When false (real-time listener refresh) the current page is kept
 * so live updates don't jump the superadmin around.
 */
function applyApprovalFilters(resetPage = true) {
    const keyword = approvalSearch ? approvalSearch.value.trim().toLowerCase() : '';
    const selectedStatus = approvalStatusFilter ? approvalStatusFilter.value : 'all';
    const selectedBranch = approvalBranchFilter ? approvalBranchFilter.value : 'all';

    // ===== Exclude tickets that were never submitted for approval =====
    filteredApprovalTickets = allTickets.filter(ticket => {
        if (!isSubmittedForApproval(ticket)) return false;

        const searchable = `${ticket.ticketNumber || ''} ${ticket.branch || ''} ${ticket.name || ''} ${ticket.incident || ''}`.toLowerCase();
        const keywordMatch = !keyword || searchable.includes(keyword);
        const statusMatch = selectedStatus === 'all' || getApprovalStatusText(ticket) === selectedStatus;
        const branchMatch = selectedBranch === 'all' || ticket.branch === selectedBranch;
        return keywordMatch && statusMatch && branchMatch;
    });

    if (resetPage) approvalPage = 1;
    renderApprovalList();
}

function filterApprovalTickets() {
    applyApprovalFilters(true);
}

function renderApprovalAttachments(ticket) {
    const managerGrid = document.getElementById('approvalManagerAttachments');
    const operatorGrid = document.getElementById('approvalOperatorAttachments');
    if (!managerGrid || !operatorGrid) {
        // Legacy fallback: render into the flat grid if it still exists.
        const oldGrid = approvalAttachmentsGrid;
        if (oldGrid) oldGrid.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No attachments.</p>';
        return;
    }
    const split = splitApprovalAttachments(ticket);
    const isAdmin = currentUserIsSuperAdmin();
    const ticketId = ticket ? ticket.id : '';
    const renderGroup = (atts) => atts.map((att, index) => {
        const url = att.secure_url || '';
        const name = att.name || ('Attachment ' + (index + 1));
        const sizeText = att.bytes ? formatFileSize(att.bytes) : '';
        const isImage = att.resource_type === 'image';
        const icon = getAttachmentIcon(att.resource_type, att.format);
        const color = getAttachmentColor(att.format);

        let preview;
        if (isImage) {
            preview = `<img src="${getCloudinaryThumbUrl(url, 200, 200)}" alt="${escapeHTML(name)}" loading="lazy"
                onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';">`;
            preview += `<div class="attachment-file-icon" style="display:none;"><i class="fas ${icon}" style="color:${color}"></i></div>`;
        } else {
            preview = `<div class="attachment-file-icon"><i class="fas ${icon}" style="color:${color}"></i></div>`;
        }

        const removeBtn = isAdmin ? `
            <button type="button" class="attachment-remove" data-tooltip="Remove"
                onclick="removeApprovalAttachment('${escapeHTML(ticketId)}', '${escapeHTML(att.public_id || '')}')">
                <i class="fas fa-times"></i>
            </button>
        ` : '';

        return `
            <div class="attachment-item" data-public-id="${escapeHTML(att.public_id || '')}">
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="attachment-preview" title="${escapeHTML(name)}">
                    ${preview}
                </a>
                <div class="attachment-meta">
                    <span class="attachment-name" title="${escapeHTML(name)}">${escapeHTML(name)}</span>
                    ${sizeText ? `<span class="attachment-size">${escapeHTML(sizeText)}</span>` : ''}
                </div>
                ${removeBtn}
            </div>
        `;
    }).join('');

    const emptyHtml = '<p class="review-empty-files">No files available.</p>';
    managerGrid.innerHTML = split.manager.length > 0 ? renderGroup(split.manager) : emptyHtml;
    operatorGrid.innerHTML = split.operator.length > 0 ? renderGroup(split.operator) : emptyHtml;

    const managerCount = document.getElementById('approvalManagerAttCount');
    const operatorCount = document.getElementById('approvalOperatorAttCount');
    if (managerCount) managerCount.textContent = '(' + split.manager.length + ')';
    if (operatorCount) operatorCount.textContent = '(' + split.operator.length + ')';
}

/**
 * Resolve the full attachment list for a ticket, falling back across the nested
 * `resolution.attachments`, top-level `attachments`, and the single
 * `resolutionAttachmentUrl` string written by older/other flows.
 */
function getApprovalAllAttachments(ticket) {
    const resolution = (ticket && ticket.resolution) || {};
    let atts = Array.isArray(resolution.attachments) ? resolution.attachments : [];
    if (atts.length === 0 && ticket && Array.isArray(ticket.attachments)) atts = ticket.attachments;
    if (atts.length === 0 && ticket && ticket.resolutionAttachmentUrl) {
        atts = [{ secure_url: ticket.resolutionAttachmentUrl, name: 'Resolution attachment', resource_type: 'raw', format: '' }];
    }
    return atts;
}

/**
 * Operator-submitted footage.
 *  - New data model: `resolution.operatorFootage` (written when the operator
 *    submits a resolution / revision).
 *  - Legacy fallback: `resolvedAdditionalFootage` (footage-request flow).
 */
function getApprovalOperatorFootage(ticket) {
    const resolution = (ticket && ticket.resolution) || {};
    if (Array.isArray(resolution.operatorFootage) && resolution.operatorFootage.length > 0) return resolution.operatorFootage;
    if (ticket && Array.isArray(ticket.resolvedAdditionalFootage)) return ticket.resolvedAdditionalFootage;
    return [];
}

/**
 * Split a ticket's attachments into the manager's original request files and
 * the operator's resolution footage:
 *  - if operator footage is known, the manager's files are everything else;
 *  - otherwise, if the manager's request files are known (`requesterAttachments`,
 *    written at ticket creation), the operator's footage is everything else;
 *  - legacy tickets with only a single merged list show it under the Manager's
 *    Request so nothing is hidden from the reviewer.
 */
function splitApprovalAttachments(ticket) {
    const all = getApprovalAllAttachments(ticket);
    const footage = getApprovalOperatorFootage(ticket);
    const requester = (ticket && Array.isArray(ticket.requesterAttachments)) ? ticket.requesterAttachments : null;

    const keyOf = (a) => (a && (a.public_id || a.secure_url)) || '';
    const keySet = (list) => new Set((list || []).map(keyOf).filter(Boolean));

    if (footage.length > 0) {
        const keys = keySet(footage);
        return {
            manager: all.filter(a => !keys.has(keyOf(a))),
            operator: footage.slice()
        };
    }
    if (requester && requester.length > 0) {
        const keys = keySet(requester);
        return {
            manager: requester.slice(),
            operator: all.filter(a => !keys.has(keyOf(a)))
        };
    }
    return { manager: all.slice(), operator: [] };
}

/**
 * Superadmin: remove a single attachment from a ticket in the Approvals tab.
 * Keeps both top-level `attachments` and `resolution.attachments` in sync.
 */
window.removeApprovalAttachment = async function(ticketId, publicId) {
    if (!ticketId || !publicId) return;
    if (!currentUserIsSuperAdmin()) { console.log('Permission denied.'); return; }
    const confirmed = await showConfirmDialog({
        title: 'Remove Attachment',
        message: 'Remove this attachment from the ticket?',
        confirmText: 'Remove',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmed) return;

    try {
        const ticketDoc = await db.collection('tickets').doc(ticketId).get();
        if (!ticketDoc.exists) return;
        const data = ticketDoc.data();
        const existing = Array.isArray(data.attachments) ? data.attachments : [];
        const oldResolution = data.resolution || {};
        const oldResAtts = Array.isArray(oldResolution.attachments) ? oldResolution.attachments : [];
        const oldReqAtts = Array.isArray(data.requesterAttachments) ? data.requesterAttachments : [];
        const oldResFootage = Array.isArray(oldResolution.operatorFootage) ? oldResolution.operatorFootage : [];

        const remaining = existing.filter(a => a.public_id !== publicId);
        const remainingRes = oldResAtts.filter(a => a.public_id !== publicId);
        const remainingReq = oldReqAtts.filter(a => a.public_id !== publicId);
        const remainingFootage = oldResFootage.filter(a => a.public_id !== publicId);

        await db.collection('tickets').doc(ticketId).update({
            attachments: remaining,
            ...(oldReqAtts.length > 0 ? { requesterAttachments: remainingReq } : {}),
            resolutionAttachmentUrl: remaining.length > 0 ? remaining[0].secure_url : '',
            resolution: {
                ...oldResolution,
                attachments: remainingRes,
                ...(oldResFootage.length > 0 ? { operatorFootage: remainingFootage } : {})
            }
        });

        const idx = allTickets.findIndex(t => t.id === ticketId);
        if (idx !== -1) {
            allTickets[idx].attachments = remaining;
            if (allTickets[idx].resolution) {
                allTickets[idx].resolution.attachments = remainingRes;
                if (Array.isArray(allTickets[idx].resolution.operatorFootage)) {
                    allTickets[idx].resolution.operatorFootage = remainingFootage;
                }
            }
            if (Array.isArray(allTickets[idx].requesterAttachments)) {
                allTickets[idx].requesterAttachments = remainingReq;
            }
            renderApprovalAttachments(allTickets[idx]);
        }

        if (approvalUploadStatus) approvalUploadStatus.textContent = 'Attachment removed.';
        setTimeout(() => { if (approvalUploadStatus) approvalUploadStatus.textContent = ''; }, 3000);
    } catch (error) {
        console.error('Remove approval attachment error:', error);
        if (approvalUploadStatus) approvalUploadStatus.textContent = 'Failed to remove attachment.';
    }
};

window.openApprovalDetails = function(id) {
    const ticket = allTickets.find(t => t.id === id);
    if (!ticket) return;

    currentApprovalTicketId = id;
    if (approvalDetailsTitle) approvalDetailsTitle.textContent = `Approval: ${ticket.ticketNumber || id}`;
    captureMainState({ tab: getActiveMainTab() || 'approvals', modal: 'approval', id });

    // Status badge in the modal header
    const statusText = getApprovalStatusText(ticket);
    const statusClass = statusText.toLowerCase().replace(/\s+/g, '-');
    if (approvalDetailsStatus) {
        approvalDetailsStatus.textContent = statusText;
        approvalDetailsStatus.className = 'status-badge ' + statusClass;
        approvalDetailsStatus.style.display = 'inline-flex';
    }

    const resolution = ticket.resolution || {};
    const resolvedBy = resolution.resolvedBy || '—';
    const resolvedAt = resolution.resolvedAt?.toDate ? formatDateTime(resolution.resolvedAt.toDate()) : (resolution.resolvedAt || '—');
    const notes = resolution.notes || ticket.resolutionNotes || 'No notes provided.';
    const requestedBy = ticket.name || '—';
    const rejection = ticket.rejection || {};
    const rejectedReason = rejection.reason || ticket.rejectionReason || ticket.approvalReason || '';

    if (approvalDetailsBody) {
        approvalDetailsBody.innerHTML = `
            <!-- ===== SECTION 1: MANAGER'S ORIGINAL REQUEST (collapsible, on top) ===== -->
            <details class="review-collapse">
                <summary>
                    <span class="review-collapse-title"><i class="fas fa-user-tie"></i> Manager's Original Request</span>
                    <span class="review-collapse-sub"><i class="fas fa-user-circle"></i> Submitted by ${escapeHTML(requestedBy)}</span>
                    <i class="fas fa-chevron-down review-collapse-caret"></i>
                </summary>
                <div class="review-collapse-body">
                    <div class="review-meta-grid">
                        <div class="review-meta"><label>Ticket Number</label><span>${escapeHTML(ticket.ticketNumber || id)}</span></div>
                        <div class="review-meta"><label>Branch</label><span>${escapeHTML(ticket.branch || '-')}</span></div>
                        <div class="review-meta"><label>Incident</label><span>${escapeHTML(ticket.incident || '-')}</span></div>
                        <div class="review-meta"><label>Incident Date</label><span>${escapeHTML(ticket.datetime || '-')}</span></div>
                        <div class="review-meta"><label>Location</label><span>${escapeHTML(ticket.location || '-')}</span></div>
                        <div class="review-meta"><label>Priority</label><span>${escapeHTML(ticket.priority || 'Low')}</span></div>
                        <div class="review-meta"><label>Position</label><span>${escapeHTML(ticket.position || '-')}</span></div>
                        <div class="review-meta"><label>Contact</label><span>${escapeHTML(ticket.contact || '-')}</span></div>
                        <div class="review-meta full"><label>Email</label><span>${escapeHTML(ticket.email || '-')}</span></div>
                        <div class="review-meta full"><label>Issue Description</label><p class="review-note">${escapeHTML(ticket.description || 'No description.')}</p></div>
                    </div>
                    <div class="review-attachments-label"><i class="fas fa-paperclip"></i> Manager's Attachments <span id="approvalManagerAttCount">(0)</span></div>
                    <div class="attachments-grid" id="approvalManagerAttachments"></div>
                </div>
            </details>

            <!-- ===== SECTION 2: OPERATOR'S RESOLUTION (visible below) ===== -->
            <div class="review-card operator">
                <div class="review-card-header">
                    <h3><i class="fas fa-video"></i> Operator's Resolution Report</h3>
                    <span class="review-card-sub"><i class="fas fa-user-cog"></i> Resolved by ${escapeHTML(resolvedBy)}</span>
                </div>
                <div class="review-meta-grid">
                    <div class="review-meta"><label>Resolved By</label><span>${escapeHTML(resolvedBy)}</span></div>
                    <div class="review-meta"><label>Resolved At</label><span>${escapeHTML(resolvedAt)}</span></div>
                    <div class="review-meta full"><label>Action Taken / Findings</label><p class="review-note">${escapeHTML(notes)}</p></div>
                    ${rejectedReason ? `<div class="review-meta full"><label>Rejection Reason</label><p class="review-note review-rejection">${escapeHTML(rejectedReason)}</p></div>` : ''}
                </div>
                <div class="review-attachments-label"><i class="fas fa-film"></i> Operator's Added Footage <span id="approvalOperatorAttCount">(0)</span></div>
                <div class="attachments-grid" id="approvalOperatorAttachments"></div>
            </div>
        `;
    }

    renderApprovalAttachments(ticket);
    if (approvalUploadStatus) approvalUploadStatus.textContent = '';
    if (approvalAttachmentInput) approvalAttachmentInput.value = '';

    // Footer actions only appear for tickets still awaiting final approval
    const canAct = isPendingApproval(ticket) && currentUserIsSuperAdmin();
    if (approvalModalFooter) approvalModalFooter.style.display = canAct ? 'flex' : 'none';
    if (btnApproveApproval) btnApproveApproval.onclick = () => window.approveResolution(id);
    if (btnRejectApproval) btnRejectApproval.onclick = () => window.rejectTicket(id);

    if (approvalDetailsModal) approvalDetailsModal.classList.add('active');
};

if (closeApprovalDetails) closeApprovalDetails.addEventListener('click', () => {
    if (approvalDetailsModal) approvalDetailsModal.classList.remove('active');
    currentApprovalTicketId = null;
    try { clearMainModalCtx(); } catch (e) { /* ignore */ }
});
if (approvalDetailsModal) approvalDetailsModal.addEventListener('click', (e) => {
    if (e.target === approvalDetailsModal) {
        approvalDetailsModal.classList.remove('active');
        currentApprovalTicketId = null;
        try { clearMainModalCtx(); } catch (e) { /* ignore */ }
    }
});

// ===== Superadmin: upload additional attachments from the approval details modal =====
if (btnUploadApprovalAttachment) {
    btnUploadApprovalAttachment.addEventListener('click', async () => {
        const id = currentApprovalTicketId;
        if (!id) {
            if (approvalUploadStatus) approvalUploadStatus.textContent = 'No ticket selected.';
            return;
        }
if (!isCloudinaryConfigured()) {
            if (approvalUploadStatus) approvalUploadStatus.textContent = '⚠️ Cloudinary not configured.';
            return;
        }
        const input = approvalAttachmentInput;
        if (!input || !input.files || input.files.length === 0) {
            if (approvalUploadStatus) approvalUploadStatus.textContent = 'Choose a file first.';
            return;
        }

        const files = Array.from(input.files);
        const v = validateUploadFiles(files);
        if (!v.ok) { if (approvalUploadStatus) { approvalUploadStatus.textContent = v.message; approvalUploadStatus.classList.add('error'); } return; }

        const widget = input.closest('.upload-widget');
        if (widget) resetUploadProgress(widget);

        const uploadBtn = btnUploadApprovalAttachment;
        if (uploadBtn) uploadBtn.disabled = true;
        if (approvalUploadStatus) approvalUploadStatus.textContent = 'Uploading...';

        try {
            const uploaded = [];
            for (const file of files) {
                const att = await cloudinaryUpload(file, id, (pct) => {
                    if (widget) setUploadProgress(widget, pct);
                });
                uploaded.push(att);
            }
            if (widget) finishUploadProgress(widget, true);

            const ticketDoc = await db.collection('tickets').doc(id).get();
            const data = ticketDoc.exists ? ticketDoc.data() : {};
            const existing = Array.isArray(data.attachments) ? data.attachments : [];
            const oldResolution = data.resolution || {};
            const oldResAtts = Array.isArray(oldResolution.attachments) ? oldResolution.attachments : [];
            const oldResFootage = Array.isArray(oldResolution.operatorFootage) ? oldResolution.operatorFootage : [];
            const merged = existing.concat(uploaded);
            const mergedRes = oldResAtts.concat(uploaded);
            const mergedFootage = oldResFootage.concat(uploaded);
            await db.collection('tickets').doc(id).update({
                attachments: merged,
                resolutionAttachmentUrl: merged.length > 0 ? merged[0].secure_url : '',
                resolution: {
                    ...oldResolution,
                    attachments: mergedRes,
                    operatorFootage: mergedFootage
                }
            });

            const idx = allTickets.findIndex(t => t.id === id);
            if (idx !== -1) {
                allTickets[idx].attachments = merged;
                if (allTickets[idx].resolution) {
                    allTickets[idx].resolution.attachments = mergedRes;
                    allTickets[idx].resolution.operatorFootage = mergedFootage;
                }
                renderApprovalAttachments(allTickets[idx]);
            }

            if (approvalUploadStatus) approvalUploadStatus.textContent = `Uploaded ${uploaded.length} file(s).`;
            if (input) input.value = '';
            setTimeout(() => { if (approvalUploadStatus) approvalUploadStatus.textContent = ''; }, 4000);
        } catch (error) {
            console.error('Approval attachment upload error:', error);
            if (approvalUploadStatus) approvalUploadStatus.textContent = 'Upload failed: ' + error.message;
        } finally {
            if (uploadBtn) uploadBtn.disabled = false;
        }
    });
}

// ===== "Edit Approval Information" modal (Superadmin) =====
// Opens from the approval details modal so the superadmin can revise the
// resolution notes and attach additional evidence without leaving the tab.
window.openEditApprovalModal = function(id) {
    const ticket = allTickets.find(t => t.id === id);
    if (!ticket) return;

    currentApprovalTicketId = id;
    if (editApprovalTitle) editApprovalTitle.textContent = `Edit Approval Info: ${ticket.ticketNumber || id}`;
    captureMainState({ tab: getActiveMainTab() || 'approvals', modal: 'approval', id });
    if (editApprovalTicketId) editApprovalTicketId.textContent = ticket.ticketNumber || id;

    const resolution = ticket.resolution || {};
    if (editApprovalNotes) editApprovalNotes.value = resolution.notes || ticket.resolutionNotes || '';
    if (editApprovalAttachmentInput) editApprovalAttachmentInput.value = '';
    if (editApprovalUploadStatus) editApprovalUploadStatus.textContent = '';
    if (editApprovalError) editApprovalError.style.display = 'none';

    if (editApprovalModal) editApprovalModal.classList.add('active');
};

if (closeEditApprovalModal) closeEditApprovalModal.addEventListener('click', () => {
    if (editApprovalModal) editApprovalModal.classList.remove('active');
});
if (cancelEditApproval) cancelEditApproval.addEventListener('click', () => {
    if (editApprovalModal) editApprovalModal.classList.remove('active');
});
if (editApprovalModal) editApprovalModal.addEventListener('click', (e) => {
    if (e.target === editApprovalModal) editApprovalModal.classList.remove('active');
});

// Upload additional attachment from the edit-approval modal
if (btnUploadEditApprovalAttachment) {
    btnUploadEditApprovalAttachment.addEventListener('click', async () => {
        const id = currentApprovalTicketId;
        if (!id) {
            if (editApprovalUploadStatus) editApprovalUploadStatus.textContent = 'No ticket selected.';
            return;
        }
        if (!isCloudinaryConfigured()) {
            if (editApprovalUploadStatus) editApprovalUploadStatus.textContent = '\u26A0\uFE0F Cloudinary not configured.';
            return;
        }
const input = editApprovalAttachmentInput;
        if (!input || !input.files || input.files.length === 0) {
            if (editApprovalUploadStatus) editApprovalUploadStatus.textContent = 'Choose a file first.';
            return;
        }

        const files = Array.from(input.files);
        const v = validateUploadFiles(files);
        if (!v.ok) { if (editApprovalUploadStatus) { editApprovalUploadStatus.textContent = v.message; editApprovalUploadStatus.classList.add('error'); } return; }

        const widget = input.closest('.upload-widget');
        if (widget) resetUploadProgress(widget);

        const btn = btnUploadEditApprovalAttachment;
        if (btn) btn.disabled = true;
        if (editApprovalUploadStatus) { editApprovalUploadStatus.textContent = 'Uploading...'; editApprovalUploadStatus.classList.remove('success', 'error'); }

        try {
            const uploaded = [];
            for (const file of files) {
                const att = await cloudinaryUpload(file, id, (pct) => {
                    if (widget) setUploadProgress(widget, pct);
                });
                uploaded.push(att);
            }
            if (widget) finishUploadProgress(widget, true);

            const ticketDoc = await db.collection('tickets').doc(id).get();
            const data = ticketDoc.exists ? ticketDoc.data() : {};
            const existing = Array.isArray(data.attachments) ? data.attachments : [];
            const oldResolution = data.resolution || {};
            const oldResAtts = Array.isArray(oldResolution.attachments) ? oldResolution.attachments : [];
            const oldResFootage = Array.isArray(oldResolution.operatorFootage) ? oldResolution.operatorFootage : [];
            const merged = existing.concat(uploaded);
            const mergedRes = oldResAtts.concat(uploaded);
            const mergedFootage = oldResFootage.concat(uploaded);
            await db.collection('tickets').doc(id).update({
                attachments: merged,
                resolutionAttachmentUrl: merged.length > 0 ? merged[0].secure_url : '',
                resolution: {
                    ...oldResolution,
                    attachments: mergedRes,
                    operatorFootage: mergedFootage
                }
            });

            const idx = allTickets.findIndex(t => t.id === id);
            if (idx !== -1) {
                allTickets[idx].attachments = merged;
                if (allTickets[idx].resolution) {
                    allTickets[idx].resolution.attachments = mergedRes;
                    allTickets[idx].resolution.operatorFootage = mergedFootage;
                }
            }

            if (editApprovalUploadStatus) editApprovalUploadStatus.textContent = `Uploaded ${uploaded.length} file(s).`;
            if (input) input.value = '';
            setTimeout(() => { if (editApprovalUploadStatus) editApprovalUploadStatus.textContent = ''; }, 4000);
        } catch (error) {
            console.error('Edit approval attachment upload error:', error);
            if (editApprovalUploadStatus) editApprovalUploadStatus.textContent = 'Upload failed: ' + error.message;
        } finally {
            if (btn) btn.disabled = false;
        }
    });
}

// Save edited approval information
if (saveApprovalInfoBtn) {
    saveApprovalInfoBtn.addEventListener('click', async () => {
        const id = currentApprovalTicketId;
        if (!id) return;

        const notes = editApprovalNotes ? editApprovalNotes.value.trim() : '';
        if (!notes) {
            if (editApprovalError) {
                editApprovalError.textContent = 'Please enter resolution notes.';
                editApprovalError.style.display = 'block';
            }
            return;
        }

        const btn = saveApprovalInfoBtn;
        if (btn) btn.disabled = true;

        try {
            const ticketDoc = await db.collection('tickets').doc(id).get();
            const existingAtt = (ticketDoc.exists && Array.isArray(ticketDoc.data().attachments)) ? ticketDoc.data().attachments : [];
            const oldResolution = (ticketDoc.exists && ticketDoc.data().resolution) || {};

            await firestoreService.updateTicket(id, {
                resolutionNotes: notes,
                resolutionAttachmentUrl: existingAtt.length > 0 ? existingAtt[0].secure_url : '',
                resolution: {
                    notes,
                    attachments: existingAtt,
                    operatorFootage: Array.isArray(oldResolution.operatorFootage) ? oldResolution.operatorFootage : [],
                    resolvedAt: oldResolution.resolvedAt || firebase.firestore.FieldValue.serverTimestamp(),
                    resolvedBy: oldResolution.resolvedBy || (auth.currentUser && auth.currentUser.email) || 'unknown'
                }
            });

            if (editApprovalModal) editApprovalModal.classList.remove('active');
            if (approvalDetailsModal) approvalDetailsModal.classList.remove('active');
            currentApprovalTicketId = null;
            console.log('Approval information updated');
            // ===== Immediate UI refresh (real-time listener is a backup) =====
            updateApprovalsBadge();
            applyApprovalFilters(false);
        } catch (error) {
            console.error('Failed to update approval info:', error);
            if (editApprovalError) {
                editApprovalError.textContent = 'Failed to save changes. Please try again.';
                editApprovalError.style.display = 'block';
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    });
}

window.approveResolution = async function(id) {
    const confirmed = await showConfirmDialog({
        title: 'Approve Resolution',
        message: 'Approve this resolution? The ticket will be marked as <strong>Resolved</strong>.',
        confirmText: 'Approve',
        danger: false,
        icon: 'fa-check-circle'
    });
    if (!confirmed) return;
    try {
        await firestoreService.updateTicket(id, {
            approvalStatus: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: (auth.currentUser && auth.currentUser.email) || 'unknown'
        });
        console.log('Resolution approved');
        if (approvalDetailsModal) approvalDetailsModal.classList.remove('active');
        currentApprovalTicketId = null;
        // ===== Immediate UI refresh (real-time listener is a backup) =====
        updateApprovalsBadge();
        applyApprovalFilters(false);
    } catch (error) {
        console.error('Approval error:', error);
        console.log('Failed to approve resolution.');
    }
};

function renderApprovalList() {
    if (!approvalListBody) return;

    const totalItems = filteredApprovalTickets.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    if (approvalPage > totalPages) approvalPage = totalPages;
    if (approvalPage < 1) approvalPage = 1;

    const start = (approvalPage - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, totalItems);
    const pageItems = filteredApprovalTickets.slice(start, end);

    if (pageItems.length === 0) {
        approvalListBody.innerHTML = `<tr><td colspan="8" class="empty-state"><i class="fas fa-check-circle"></i><p>No approval records found.</p></td></tr>`;
    } else {
        approvalListBody.innerHTML = pageItems.map(ticket => {
            const statusText = getApprovalStatusText(ticket);
            const statusClass = statusText.toLowerCase().replace(/\s+/g, '-');
            const created = ticket.createdAt?.toDate ? formatDate(ticket.createdAt.toDate()) : (ticket.createdAt || '\u2014');
            const approvedAt = ticket.approvedAt?.toDate ? formatDate(ticket.approvedAt.toDate()) : (ticket.approvedAt || '\u2014');

            let actions = '';
            if (isPendingApproval(ticket)) {
                actions = `<div class="action-group">
                    <button class="action-btn approve" data-tooltip="Approve" onclick="window.approveResolution('${ticket.id}')"><i class="fas fa-check"></i></button>
                    <button class="action-btn reject" data-tooltip="Reject" onclick="window.rejectTicket('${ticket.id}')"><i class="fas fa-times"></i></button>
                    <button class="action-btn edit" data-tooltip="Edit Approval Info" onclick="window.openEditApprovalModal('${ticket.id}')"><i class="fas fa-edit"></i></button>
                    <button class="action-btn view" data-tooltip="Details" onclick="window.openApprovalDetails('${ticket.id}')"><i class="fas fa-eye"></i></button>
                </div>`;
            } else {
                actions = `<div class="action-group">
                    <button class="action-btn edit" data-tooltip="Edit Approval Info" onclick="window.openEditApprovalModal('${ticket.id}')"><i class="fas fa-edit"></i></button>
                    <button class="action-btn view" data-tooltip="Details" onclick="window.openApprovalDetails('${ticket.id}')"><i class="fas fa-eye"></i></button>
                </div>`;
            }

            return `<tr>
                <td><span class="ticket-link" onclick="window.openApprovalDetails('${ticket.id}')">${escapeHTML(ticket.ticketNumber || ticket.id)}</span></td>
                <td>${escapeHTML(ticket.branch || '\u2014')}</td>
                <td>${escapeHTML(ticket.incident || '\u2014')}</td>
                <td>${escapeHTML(ticket.name || '\u2014')}</td>
                <td>${created}</td>
                <td><span class="status-badge ${statusClass}">${escapeHTML(statusText)}</span></td>
                <td>${approvedAt}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');
    }

    // Stats summary — only count tickets that were actually submitted for approval
    // (Pending / In Progress tickets never entered the approval workflow)
    const submitted = allTickets.filter(t => isSubmittedForApproval(t)).length;
    const pendingApproval = allTickets.filter(t => isPendingApproval(t)).length;
    const approved = allTickets.filter(t => isApprovedTicket(t)).length;
    const rejected = allTickets.filter(t => isRejectedTicket(t)).length;
    if (approvalTotalCount) approvalTotalCount.textContent = submitted;
    if (approvalPendingCount) approvalPendingCount.textContent = pendingApproval;
    if (approvalApprovedCount) approvalApprovedCount.textContent = approved;
    if (approvalRejectedCount) approvalRejectedCount.textContent = rejected;

    // Pagination controls
    if (approvalPagination) {
        if (totalPages <= 1) {
            approvalPagination.innerHTML = `<span class="page-info">Showing all ${totalItems} record(s)</span>`;
        } else {
            let html = `<button onclick="window.goToApprovalPage(${approvalPage - 1})" ${approvalPage <= 1 ? 'disabled' : ''}>\u00AB Prev</button>`;
            const maxVisiblePages = 5;
            let startPage = Math.max(1, approvalPage - Math.floor(maxVisiblePages / 2));
            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
            if (endPage - startPage + 1 < maxVisiblePages) startPage = Math.max(1, endPage - maxVisiblePages + 1);
            for (let i = startPage; i <= endPage; i++) {
                html += `<button class="${i === approvalPage ? 'active' : ''}" onclick="window.goToApprovalPage(${i})">${i}</button>`;
            }
            html += `<button onclick="window.goToApprovalPage(${approvalPage + 1})" ${approvalPage >= totalPages ? 'disabled' : ''}>Next \u00BB</button>`;
            html += `<span class="page-info">Page ${approvalPage} of ${totalPages}</span>`;
            approvalPagination.innerHTML = html;
        }
    }
}

window.goToApprovalPage = function(page) {
    approvalPage = page;
    renderApprovalList();
};

if (approvalSearch) approvalSearch.addEventListener('input', debounce(filterApprovalTickets, 300));
if (approvalStatusFilter) approvalStatusFilter.addEventListener('change', filterApprovalTickets);
if (approvalBranchFilter) approvalBranchFilter.addEventListener('change', filterApprovalTickets);

function renderPagination() {
    if (!paginationControls) return;
    const totalItems = filteredTickets.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, totalItems);
    const pageItems = filteredTickets.slice(start, end);

    displayTickets(pageItems);

    if (totalPages <= 1) {
        paginationControls.innerHTML = `<span class="page-info">Showing all ${totalItems} tickets</span>`;
        return;
    }

    let html = `<button onclick="goToPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>\u00AB Prev</button>`;
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) startPage = Math.max(1, endPage - maxVisiblePages + 1);

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    html += `<button onclick="goToPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next \u00BB</button>`;
    html += `<span class="page-info">Page ${currentPage} of ${totalPages} (${totalItems} tickets)</span>`;

    paginationControls.innerHTML = html;
}

window.goToPage = function(page) {
    currentPage = page;
    renderPagination();
};

window.startTicket = async function(id) {
    try {
        await firestoreService.updateTicket(id, { status: 'In Progress' });
        console.log('Ticket moved to In Progress');
    } catch (error) {
        console.log('Failed to start ticket');
    }
};

window.resolveTicket = function(id) {
    const ticket = allTickets.find(t => t.id === id);
    if (!ticket) return;
currentResolveTicketId = id;
    // Map the resolve widget to this ticket id so auto-uploads go to the right folder
    const resolveWidget = document.getElementById('resolveDropzone') ? document.getElementById('resolveDropzone').closest('.upload-widget') : null;
    if (resolveWidget) {
        autoUploadTicketId.set(resolveWidget, id);
        resetAutoUpload(resolveWidget);
        resetUploadProgress(resolveWidget);
    }
    if (resolveModalTitle) resolveModalTitle.textContent = `Resolve Ticket: ${ticket.ticketNumber || id}`;
    if (resolutionNotesEl) resolutionNotesEl.value = '';
    if (resolveAttachmentInput) resolveAttachmentInput.value = '';
    // Show any existing ticket attachments so the operator keeps prior evidence in view
    renderAttachmentsIntoGrid(document.getElementById('resolveAttachmentsGrid'), ticket);
    if (resolveModal) resolveModal.classList.add('active');
};

if (closeResolveModal) closeResolveModal.addEventListener('click', () => { if (resolveModal) resolveModal.classList.remove('active'); currentResolveTicketId = null; });
if (cancelResolve) cancelResolve.addEventListener('click', () => { if (resolveModal) resolveModal.classList.remove('active'); currentResolveTicketId = null; });
if (resolveModal) resolveModal.addEventListener('click', (e) => { if (e.target === resolveModal) { resolveModal.classList.remove('active'); currentResolveTicketId = null; } });

if (submitResolutionBtn) {
    submitResolutionBtn.addEventListener('click', async () => {
        const id = currentResolveTicketId;
        if (!id) return;
        const notes = resolutionNotesEl ? resolutionNotesEl.value.trim() : '';
        const fileInput = resolveAttachmentInput;
        const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];

        if (!notes) {
            if (resolutionNotesEl) {
                resolutionNotesEl.style.borderColor = 'var(--color-danger)';
                resolutionNotesEl.focus();
            }
            return;
        }

const btn = submitResolutionBtn;
        if (btn) btn.disabled = true;

        const resolveWidget = fileInput ? fileInput.closest('.upload-widget') : null;
        if (resolveWidget) resetUploadProgress(resolveWidget);
        if (resolveUploadStatus) { resolveUploadStatus.textContent = ''; resolveUploadStatus.classList.remove('success', 'error'); }

try {
            // 1) Upload any attachments (optional) to Cloudinary
            // Start with files already uploaded via the auto-upload dropzone
            const resolveWidgetRoot = document.getElementById('resolveDropzone') ? document.getElementById('resolveDropzone').closest('.upload-widget') : null;
            const autoKey = document.getElementById('resolveDropzone') ? document.getElementById('resolveDropzone').id : 'auto';
            let attachmentList = (autoUploadedAttachments[autoKey] || []).slice();
            if (files.length > 0) {
                if (!isCloudinaryConfigured()) {
                    console.log('Cloudinary not configured. Attachments skipped.');
                } else {
                    const v = validateUploadFiles(files);
                    if (!v.ok) {
                        if (resolveUploadStatus) { resolveUploadStatus.textContent = v.message; resolveUploadStatus.classList.add('error'); }
                        // Show the error state on the progress bar too
                        if (resolveWidget) finishUploadProgress(resolveWidget, false);
                        return;
                    }
                    for (const file of files) {
                        try {
                            const att = await cloudinaryUpload(file, id, (pct) => {
                                if (resolveWidget) setUploadProgress(resolveWidget, pct);
                            });
                            attachmentList.push(att);
                        } catch (e) { console.error('Attachment upload error:', e); }
                    }
                }
            }
            // Mark progress as complete (100%) — handles both "no files" and "files uploaded" cases
            if (resolveWidget) finishUploadProgress(resolveWidget, true);

            // 2) Merge with existing ticket attachments
            const ticket = allTickets.find(t => t.id === id);
            const existingAtt = (ticket && Array.isArray(ticket.attachments)) ? ticket.attachments : [];
            const mergedAtt = existingAtt.concat(attachmentList);

            // Check if this ticket had additional footage requested
            // (re-resolution after an "Insufficient Footage" footage request).
            // If so, store only the *newly uploaded* attachments separately so
            // the Track Ticket page can show them in a distinct section.
            const comments = (ticket && Array.isArray(ticket.comments)) ? ticket.comments : [];
            const hasFootageRequest = comments.some(c => c && c.type === 'footage_request');

            // 3) Mark Resolved + pending superadmin approval
            const updateData = {
                status: 'Resolved',
                approvalStatus: 'pending_approval',
                // Top-level fields (per spec) kept in sync with the nested object
                resolutionNotes: notes,
                resolutionAttachmentUrl: mergedAtt.length > 0 ? mergedAtt[0].secure_url : '',
                attachments: mergedAtt,
                // Store newly uploaded attachments as "resolved additional footage"
                // when the ticket was previously marked Insufficient Footage
                resolvedAdditionalFootage: hasFootageRequest && attachmentList.length > 0
                    ? attachmentList
                    : firebase.firestore.FieldValue.delete(),
                // Clear any previous rejection data when resubmitting a For Revision ticket
                rejectionReason: firebase.firestore.FieldValue.delete(),
                rejection: firebase.firestore.FieldValue.delete(),
                resolution: {
                    notes,
                    attachments: mergedAtt,
                    operatorFootage: attachmentList,
                    resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    resolvedBy: (auth.currentUser && auth.currentUser.email) || 'unknown'
                }
            };
            await firestoreService.updateTicket(id, updateData);

            console.log('Resolution submitted for approval');
            if (resolveModal) resolveModal.classList.remove('active');
            currentResolveTicketId = null;
            // Clear the auto-uploaded attachments for this widget
            if (resolveWidgetRoot) resetAutoUpload(resolveWidgetRoot);
        } catch (error) {
            console.error('Failed to submit resolution:', error);
            console.log('Failed to submit resolution. Please try again.');
        } finally {
            if (btn) btn.disabled = false;
            if (resolutionNotesEl) resolutionNotesEl.style.borderColor = '';
            if (fileInput) fileInput.value = '';
        }
    });
}

// ==============================================================
//  REVISE & RESUBMIT MODAL (For Revision tickets)
//  When a superadmin rejects a resolution, the ticket is sent back
//  with the status "For Revision". The operator opens this modal to
//  review the rejection reason, update the resolution notes /
//  attachments, and resubmit for approval.
// ==============================================================

window.reviseTicket = function(id) {
    const ticket = allTickets.find(t => t.id === id);
    if (!ticket) return;

currentResolveTicketId = id;

    // Reset the set of existing attachments the operator removes during this
    // revision session (fresh state each time the modal opens).
    removedRevisionAttachmentIds = new Set();

    // Map the revision widget to this ticket id so auto-uploads go to the right folder
    const revisionWidget = document.getElementById('revisionDropzone') ? document.getElementById('revisionDropzone').closest('.upload-widget') : null;
    if (revisionWidget) {
        autoUploadTicketId.set(revisionWidget, id);
        resetAutoUpload(revisionWidget);
        resetUploadProgress(revisionWidget);
    }

    if (revisionModalTitle) revisionModalTitle.textContent = `Revise & Resubmit: ${ticket.ticketNumber || id}`;

    // Show the superadmin's rejection reason so the operator knows what to fix
    const rejection = ticket.rejection || {};
    const reason = rejection.reason || ticket.rejectionReason || 'No rejection reason provided.';
    if (revisionRejectionReason) {
        revisionRejectionReason.textContent = reason;
    }

    // Pre-fill the notes with the previous resolution so the operator can amend them
    const resolution = ticket.resolution || {};
    const prevNotes = resolution.notes || ticket.resolutionNotes || '';
    if (revisionNotesEl) revisionNotesEl.value = prevNotes;

if (revisionAttachmentInput) revisionAttachmentInput.value = '';
    if (revisionUploadStatus) revisionUploadStatus.textContent = '';
if (revisionError) revisionError.style.display = 'none';
    // Show existing ticket attachments with remove (×) buttons so the operator
    // can delete prior evidence before resubmitting.
    renderRevisionAttachments(document.getElementById('revisionAttachmentsGrid'), ticket);
    if (revisionModal) revisionModal.classList.add('active');
};

if (closeRevisionModal) closeRevisionModal.addEventListener('click', () => { if (revisionModal) revisionModal.classList.remove('active'); currentResolveTicketId = null; });
if (cancelRevision) cancelRevision.addEventListener('click', () => { if (revisionModal) revisionModal.classList.remove('active'); currentResolveTicketId = null; });
if (revisionModal) revisionModal.addEventListener('click', (e) => { if (e.target === revisionModal) { revisionModal.classList.remove('active'); currentResolveTicketId = null; } });

if (submitRevisionBtn) {
    submitRevisionBtn.addEventListener('click', async () => {
        const id = currentResolveTicketId;
        if (!id) return;
        const notes = revisionNotesEl ? revisionNotesEl.value.trim() : '';
        const fileInput = revisionAttachmentInput;
        const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];

        if (!notes) {
            if (revisionError) {
                revisionError.textContent = 'Please enter updated resolution notes.';
                revisionError.style.display = 'block';
            }
            if (revisionNotesEl) {
                revisionNotesEl.style.borderColor = 'var(--color-danger)';
                revisionNotesEl.focus();
            }
            return;
        }

const btn = submitRevisionBtn;
        if (btn) btn.disabled = true;
        if (revisionUploadStatus) { revisionUploadStatus.textContent = ''; revisionUploadStatus.classList.remove('success', 'error'); }

const revisionWidget = fileInput ? fileInput.closest('.upload-widget') : null;
        if (revisionWidget) resetUploadProgress(revisionWidget);

try {
            // 1) Upload any new attachments (optional) to Cloudinary
            // Start with files already uploaded via the auto-upload dropzone
            const revisionWidgetRoot = document.getElementById('revisionDropzone') ? document.getElementById('revisionDropzone').closest('.upload-widget') : null;
            const autoKey = document.getElementById('revisionDropzone') ? document.getElementById('revisionDropzone').id : 'auto';
            let attachmentList = (autoUploadedAttachments[autoKey] || []).slice();
            if (files.length > 0) {
                if (!isCloudinaryConfigured()) {
                    console.log('Cloudinary not configured. Attachments skipped.');
                } else {
                    const v = validateUploadFiles(files);
                    if (!v.ok) {
                        if (revisionUploadStatus) { revisionUploadStatus.textContent = v.message; revisionUploadStatus.classList.add('error'); }
                        // Show the error state on the progress bar too
                        if (revisionWidget) finishUploadProgress(revisionWidget, false);
                        return;
                    }
                    for (const file of files) {
                        try {
                            const att = await cloudinaryUpload(file, id, (pct) => {
                                if (revisionWidget) setUploadProgress(revisionWidget, pct);
                            });
                            attachmentList.push(att);
                        } catch (e) { console.error('Attachment upload error:', e); }
                    }
                }
            }
            // Mark progress as complete (100%) — handles both "no files" and "files uploaded" cases
            if (revisionWidget) finishUploadProgress(revisionWidget, true);

            // 2) Merge with existing ticket attachments (keep prior evidence)
            const ticket = allTickets.find(t => t.id === id);
            const existingAtt = (ticket && Array.isArray(ticket.attachments)) ? ticket.attachments : [];
            const mergedAtt = existingAtt.concat(attachmentList);

            // 3) Mark Resolved + pending superadmin approval (re-enter the queue)
            const updateData = {
                status: 'Resolved',
                approvalStatus: 'pending_approval',
                resolutionNotes: notes,
                resolutionAttachmentUrl: mergedAtt.length > 0 ? mergedAtt[0].secure_url : '',
                attachments: mergedAtt,
                // Clear the previous rejection data since the resolution was revised
                rejectionReason: firebase.firestore.FieldValue.delete(),
                rejection: firebase.firestore.FieldValue.delete(),
                resolution: {
                    notes,
                    attachments: mergedAtt,
                    operatorFootage: attachmentList,
                    resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    resolvedBy: (auth.currentUser && auth.currentUser.email) || 'unknown'
                }
            };
            await firestoreService.updateTicket(id, updateData);

            console.log('Revised resolution submitted for approval');
            if (revisionModal) revisionModal.classList.remove('active');
            currentResolveTicketId = null;
            // Clear the auto-uploaded attachments for this widget
            if (revisionWidgetRoot) resetAutoUpload(revisionWidgetRoot);
            // ===== Immediate UI refresh (real-time listener is a backup) =====
            updateApprovalsBadge();
            applyApprovalFilters(false);
        } catch (error) {
            console.error('Failed to submit revised resolution:', error);
            if (revisionError) {
                revisionError.textContent = 'Failed to submit revised resolution. Please try again.';
                revisionError.style.display = 'block';
            }
        } finally {
            if (btn) btn.disabled = false;
            if (revisionNotesEl) revisionNotesEl.style.borderColor = '';
            if (fileInput) fileInput.value = '';
        }
    });
}

window.rejectTicket = function(id) {
    const ticket = allTickets.find(t => t.id === id);
    if (!ticket) return;
    currentRejectTicketId = id;
    if (rejectReasonInput) rejectReasonInput.value = '';
    if (rejectError) rejectError.style.display = 'none';
    if (rejectModal) rejectModal.classList.add('active');
};

if (closeRejectModal) closeRejectModal.addEventListener('click', () => { if (rejectModal) rejectModal.classList.remove('active'); currentRejectTicketId = null; });
if (cancelReject) cancelReject.addEventListener('click', () => { if (rejectModal) rejectModal.classList.remove('active'); currentRejectTicketId = null; });
if (rejectModal) rejectModal.addEventListener('click', (e) => { if (e.target === rejectModal) { rejectModal.classList.remove('active'); currentRejectTicketId = null; } });

if (submitRejectionBtn) {
    submitRejectionBtn.addEventListener('click', async () => {
        const id = currentRejectTicketId;
        if (!id) return;
        const reason = rejectReasonInput ? rejectReasonInput.value.trim() : '';

        if (!reason) {
            if (rejectError) rejectError.style.display = 'block';
            return;
        }

        const btn = submitRejectionBtn;
        if (btn) btn.disabled = true;

        try {
            await firestoreService.updateTicket(id, {
                status: 'For Revision',
                approvalStatus: 'rejected',
                // Top-level field (per spec) kept in sync with the nested object
                rejectionReason: reason,
                rejection: {
                    reason,
                    rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    rejectedBy: (auth.currentUser && auth.currentUser.email) || 'unknown'
                }
            });
            console.log('Resolution sent back for revision');
            if (rejectModal) rejectModal.classList.remove('active');
            if (approvalDetailsModal) approvalDetailsModal.classList.remove('active');
            currentRejectTicketId = null;
            // ===== Immediate UI refresh (real-time listener is a backup) =====
            updateApprovalsBadge();
            applyApprovalFilters(false);
        } catch (error) {
            console.error('Failed to reject resolution:', error);
            console.log('Failed to reject resolution. Please try again.');
        } finally {
            if (btn) btn.disabled = false;
        }
    });
}

window.reopenTicket = async function(id) {
    const confirmed = await showConfirmDialog({
        title: 'Reopen Ticket',
        message: 'Reopen this ticket as <strong>In Progress</strong>?',
        confirmText: 'Reopen',
        danger: false,
        icon: 'fa-redo-alt'
    });
    if (!confirmed) return;
    try {
        await firestoreService.updateTicket(id, { status: 'In Progress' });
        console.log('Ticket reopened as In Progress');
    } catch (error) {
        console.log('Failed to reopen ticket');
    }
};

window.deleteTicket = async function(id) {
    const confirmed = await showConfirmDialog({
        title: 'Delete Ticket',
        message: 'Are you sure you want to delete this ticket?',
        confirmText: 'Delete',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmed) return;
    try {
        await firestoreService.deleteTicket(id);
        console.log('Ticket deleted');
    } catch (error) {
        console.log('Failed to delete ticket');
    }
};

// ==============================================================
//  TICKET ATTACHMENTS (Cloudinary)
// ==============================================================

function isCloudinaryConfigured() {
    return CLOUDINARY_CLOUD_NAME && CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME'
        && CLOUDINARY_UPLOAD_PRESET && CLOUDINARY_UPLOAD_PRESET !== 'YOUR_UPLOAD_PRESET';
}

function setAttachmentStatus(message, isError, statusElId) {
    const el = statusElId ? document.getElementById(statusElId) : document.getElementById('attachmentUploadStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('success', 'error');
    if (isError) el.classList.add('error');
    else if (message) el.classList.add('success');
}

function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getCloudinaryThumbUrl(secureUrl, width, height) {
    // Insert transformation params before the file extension: /w_200,h_200,c_fill,q_auto,f_auto
    const marker = '/image/upload/';
    const idx = secureUrl.indexOf(marker);
    if (idx !== -1) {
        const base = secureUrl.slice(0, idx + marker.length);
        const rest = secureUrl.slice(idx + marker.length);
        const slash = rest.indexOf('/');
        if (slash !== -1) {
            return base + `w_${width || 200},h_${height || 200},c_fill,q_auto,f_auto/` + rest.slice(slash + 1);
        }
        return base + `w_${width || 200},h_${height || 200},c_fill,q_auto,f_auto/` + rest;
    }
    return secureUrl;
}

function getAttachmentIcon(resourceType, format) {
    format = (format || '').toLowerCase();
    if (resourceType === 'image') return 'fa-file-image';
    if (resourceType === 'video') return 'fa-file-video';
    if (['pdf'].includes(format)) return 'fa-file-pdf';
    if (['doc', 'docx'].includes(format)) return 'fa-file-word';
    if (['xls', 'xlsx', 'csv'].includes(format)) return 'fa-file-excel';
    if (['ppt', 'pptx'].includes(format)) return 'fa-file-powerpoint';
    if (['zip', 'rar', '7z'].includes(format)) return 'fa-file-archive';
    if (['txt'].includes(format)) return 'fa-file-alt';
    return 'fa-file';
}

function getAttachmentColor(format) {
    format = (format || '').toLowerCase();
    if (['pdf'].includes(format)) return '#dc2626';
    if (['doc', 'docx'].includes(format)) return '#2563eb';
    if (['xls', 'xlsx', 'csv'].includes(format)) return '#16a34a';
    if (['ppt', 'pptx'].includes(format)) return '#ea580c';
    if (['zip', 'rar', '7z'].includes(format)) return '#ca8a04';
    return '#64748b';
}

/**
 * Render a ticket's existing attachments into a given grid element, using the
 * same thumbnail/icon layout as the Ticket Details modal. Shared by the
 * Resolve and Revise modals so previously-uploaded evidence stays visible.
 * @param {HTMLElement} grid  the `.attachments-grid` container to fill
 * @param {object} ticket     the ticket object holding `attachments`
 */
function renderAttachmentsIntoGrid(grid, ticket) {
    if (!grid) return;
    const attachments = (ticket && Array.isArray(ticket.attachments)) ? ticket.attachments : [];
    if (attachments.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No existing attachments.</p>';
        return;
    }
    grid.innerHTML = attachments.map((att, index) => {
        const url = att.secure_url || '';
        const name = att.name || ('Attachment ' + (index + 1));
        const sizeText = att.bytes ? formatFileSize(att.bytes) : '';
        const isImage = att.resource_type === 'image';
        const isVideo = att.resource_type === 'video';
        const icon = getAttachmentIcon(att.resource_type, att.format);
        const color = getAttachmentColor(att.format);

        let preview;
        if (isImage) {
            preview = `<img src="${getCloudinaryThumbUrl(url, 200, 200)}" alt="${escapeHTML(name)}" loading="lazy"
                onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';">`;
            preview += `<div class="attachment-file-icon" style="display:none;"><i class="fas ${icon}" style="color:${color}"></i></div>`;
        } else if (isVideo) {
            preview = `<div class="attachment-file-icon"><i class="fas fa-play-circle" style="color:${color}"></i></div>`;
        } else {
            preview = `<div class="attachment-file-icon"><i class="fas ${icon}" style="color:${color}"></i></div>`;
        }

        return `
            <div class="attachment-item" data-public-id="${escapeHTML(att.public_id || '')}">
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="attachment-preview" title="${escapeHTML(name)}">
                    ${preview}
                </a>
                <div class="attachment-meta">
                    <span class="attachment-name" title="${escapeHTML(name)}">${escapeHTML(name)}</span>
                    ${sizeText ? `<span class="attachment-size">${escapeHTML(sizeText)}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Whether a ticket is allowed to display attachments in the Ticket Details modal.
 * Attachments are shown only for fully resolved tickets and for-revision tickets.
 */
/**
 * Track existing attachments the operator chooses to delete while revising a
 * ticket. These public_ids are excluded when the revised resolution is merged
 * and submitted for approval.
 */
let removedRevisionAttachmentIds = new Set();

/**
 * Render the existing attachments in the Revise & Resubmit modal with a remove
 * (×) button so the operator can delete prior evidence before resubmitting.
 * Deleted files are tracked in `removedRevisionAttachmentIds` (and removed from
 * Cloudinary) and excluded from the merged attachment list on submit.
 * @param {HTMLElement} grid    the `#revisionAttachmentsGrid` container
 * @param {object} ticket       the ticket holding `attachments`
 */
function renderRevisionAttachments(grid, ticket) {
    if (!grid) return;
    const attachments = (ticket && Array.isArray(ticket.attachments)) ? ticket.attachments : [];
    const deletedSet = new Set(removedRevisionAttachmentIds || []);
    const visible = attachments.filter(a => !deletedSet.has(a.public_id));
    if (visible.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No existing attachments.</p>';
        return;
    }
    grid.innerHTML = visible.map((att, index) => {
        const url = att.secure_url || '';
        const name = att.name || ('Attachment ' + (index + 1));
        const sizeText = att.bytes ? formatFileSize(att.bytes) : '';
        const isImage = att.resource_type === 'image';
        const isVideo = att.resource_type === 'video';
        const icon = getAttachmentIcon(att.resource_type, att.format);
        const color = getAttachmentColor(att.format);

        let preview;
        if (isImage) {
            preview = `<img src="${getCloudinaryThumbUrl(url, 200, 200)}" alt="${escapeHTML(name)}" loading="lazy"
                onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';">`;
            preview += `<div class="attachment-file-icon" style="display:none;"><i class="fas ${icon}" style="color:${color}"></i></div>`;
        } else if (isVideo) {
            preview = `<div class="attachment-file-icon"><i class="fas fa-play-circle" style="color:${color}"></i></div>`;
        } else {
            preview = `<div class="attachment-file-icon"><i class="fas ${icon}" style="color:${color}"></i></div>`;
        }

        return `
            <div class="attachment-item" data-public-id="${escapeHTML(att.public_id || '')}">
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="attachment-preview" title="${escapeHTML(name)}">
                    ${preview}
                </a>
                <div class="attachment-meta">
                    <span class="attachment-name" title="${escapeHTML(name)}">${escapeHTML(name)}</span>
                    ${sizeText ? `<span class="attachment-size">${escapeHTML(sizeText)}</span>` : ''}
                </div>
                <button type="button" class="attachment-remove" data-tooltip="Remove" data-public-id="${escapeHTML(att.public_id || '')}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }).join('');

    // Bind remove buttons to the existing attachments in the revision modal
    grid.querySelectorAll('.attachment-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const publicId = btn.dataset.publicId;
            if (!publicId) return;
            const confirmed = await showConfirmDialog({
                title: 'Remove Attachment',
                message: 'Remove this attachment before resubmitting? It will be removed from the ticket.',
                confirmText: 'Remove',
                danger: true,
                icon: 'fa-trash-alt'
            });
            if (!confirmed) return;

            removedRevisionAttachmentIds = removedRevisionAttachmentIds || new Set();
            removedRevisionAttachmentIds.add(publicId);
            renderRevisionAttachments(grid, ticket);
        });
    });
}

function ticketCanShowAttachments(ticket) {
    if (!ticket) return false;
    const status = ticket.status || 'Pending';
    const approval = ticket.approvalStatus || 'pending';
    // Fully approved "Resolved" tickets
    if (status === 'Resolved' && approval === 'approved') return true;
    // For Revision tickets (rejected resolutions kept for review)
    if (status === 'For Revision' || approval === 'rejected') return true;
    return false;
}

function renderTicketAttachments(ticket) {
    const grid = document.getElementById('ticketAttachmentsGrid');
    if (!grid) return;
    const attachments = (ticket && Array.isArray(ticket.attachments)) ? ticket.attachments : [];
    const ticketId = ticket ? ticket.id : '';
    if (attachments.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No attachments.</p>';
        return;
    }
    grid.innerHTML = attachments.map((att, index) => {
        const url = att.secure_url || '';
        const name = att.name || ('Attachment ' + (index + 1));
        const sizeText = att.bytes ? formatFileSize(att.bytes) : '';
        const isImage = att.resource_type === 'image';
        const isVideo = att.resource_type === 'video';
        const icon = getAttachmentIcon(att.resource_type, att.format);
        const color = getAttachmentColor(att.format);
        const publicId = att.public_id || '';

        const removeBtn = `
            <button type="button" class="attachment-remove" data-tooltip="Remove"
                onclick="removeTicketAttachment('${escapeHTML(ticketId)}', '${escapeHTML(publicId)}')">
                <i class="fas fa-times"></i>
            </button>
        `;

        // ===== Video attachments: inline playable preview (no anchor wrapper) =====
        if (isVideo) {
            return `
                <div class="attachment-item" data-public-id="${escapeHTML(publicId)}">
                    <div class="attachment-preview" style="padding:0;">
                        <video src="${url}" controls preload="metadata" class="attachment-video-preview"></video>
                    </div>
                    <div class="attachment-meta">
                        <span class="attachment-name" title="${escapeHTML(name)}">${escapeHTML(name)}</span>
                        ${sizeText ? `<span class="attachment-size">${escapeHTML(sizeText)}</span>` : ''}
                        <a href="${url}" target="_blank" rel="noopener noreferrer" class="attachment-open-link" title="Open full video in new tab">
                            <i class="fas fa-external-link-alt"></i> Open full video
                        </a>
                    </div>
                    ${removeBtn}
                </div>
            `;
        }

        let preview;
        if (isImage) {
            // Use the direct URL with CSS object-fit (more reliable than the
            // transformation-based thumbnail, which can fail on some URLs).
            preview = `<img src="${url}" alt="${escapeHTML(name)}" loading="lazy"
                onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';">`;
            preview += `<div class="attachment-file-icon" style="display:none;"><i class="fas ${icon}" style="color:${color}"></i></div>`;
        } else {
            preview = `<div class="attachment-file-icon"><i class="fas ${icon}" style="color:${color}"></i></div>`;
        }

        return `
            <div class="attachment-item" data-public-id="${escapeHTML(publicId)}">
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="attachment-preview" title="${escapeHTML(name)}">
                    ${preview}
                </a>
                <div class="attachment-meta">
                    <span class="attachment-name" title="${escapeHTML(name)}">${escapeHTML(name)}</span>
                    ${sizeText ? `<span class="attachment-size">${escapeHTML(sizeText)}</span>` : ''}
                </div>
                ${removeBtn}
            </div>
        `;
    }).join('');
}

window.removeTicketAttachment = async function(ticketId, publicId) {
    if (!ticketId || !publicId) return;
    const confirmed = await showConfirmDialog({
        title: 'Remove Attachment',
        message: 'Remove this attachment from the ticket?',
        confirmText: 'Remove',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmed) return;
    try {
        const ticketDoc = await db.collection('tickets').doc(ticketId).get();
        if (!ticketDoc.exists) return;
        const data = ticketDoc.data();
        const existing = Array.isArray(data.attachments) ? data.attachments : [];
        const oldRes = data.resolution || {};
        const oldResAtts = Array.isArray(oldRes.attachments) ? oldRes.attachments : [];
        const remaining = existing.filter(a => a.public_id !== publicId);
        const remainingRes = oldResAtts.filter(a => a.public_id !== publicId);

        await db.collection('tickets').doc(ticketId).update({
            attachments: remaining,
            resolutionAttachmentUrl: remaining.length > 0 ? remaining[0].secure_url : '',
            resolution: { ...oldRes, attachments: remainingRes }
        });

        const idx = allTickets.findIndex(t => t.id === ticketId);
        if (idx >= 0) allTickets[idx] = { ...allTickets[idx], attachments: remaining, resolution: { ...oldRes, attachments: remainingRes } };
        renderTicketAttachments(allTickets[idx] || { id: ticketId, attachments: remaining });
        setAttachmentStatus('Attachment removed.', false);
    } catch (e) {
        console.error('Remove attachment error:', e);
        setAttachmentStatus('Failed to remove attachment.', true);
    }
};

async function cloudinaryUpload(file, ticketId, onProgress) {
    // Use XMLHttpRequest when a progress callback is supplied so we can report
    // real upload percentage (fetch does not expose upload progress).
    if (typeof onProgress === 'function') {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            formData.append('folder', 'tickets/' + ticketId);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`);
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    onProgress(pct);
                }
            };
            xhr.onload = () => {
                let data = null;
                try { data = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
                if (xhr.status >= 200 && xhr.status < 300 && data) {
                    resolve({
                        public_id: data.public_id,
                        secure_url: data.secure_url,
                        format: data.format,
                        resource_type: data.resource_type,
                        width: data.width || null,
                        height: data.height || null,
                        bytes: data.bytes,
                        name: file.name,
                        uploadedAt: new Date().toISOString()
                    });
                } else {
                    let errMsg = 'Upload failed (' + xhr.status + ')';
                    if (data && data.error && data.error.message) errMsg = data.error.message;
                    reject(new Error(errMsg));
                }
            };
            xhr.onerror = () => reject(new Error('Network error during upload.'));
            xhr.send(formData);
        });
    }

    // Fallback: original fetch-based upload (no progress).
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', 'tickets/' + ticketId);
    const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
        { method: 'POST', body: formData }
    );
    if (!res.ok) {
        let errMsg = 'Upload failed (' + res.status + ')';
        try {
            const errData = await res.json();
            if (errData && errData.error && errData.error.message) errMsg = errData.error.message;
        } catch (e) { /* ignore parse error */ }
        throw new Error(errMsg);
    }
    const data = await res.json();
    return {
        public_id: data.public_id,
        secure_url: data.secure_url,
        format: data.format,
        resource_type: data.resource_type,
        width: data.width || null,
        height: data.height || null,
        bytes: data.bytes,
        name: file.name,
        uploadedAt: new Date().toISOString()
    };
}

// ==============================================================
//  UPLOAD WIDGET HELPERS (Dropzone + file list + progress bar)
//  Shared by the Ticket Details, Approvals, Edit Approval,
//  Resolve, and Revision modals for a consistent upload UX.
// ==============================================================

function formatFileSizeShort(bytes) {
    return formatFileSize(bytes);
}

/**
 * Build/refresh the selected-file list inside an upload widget.
 * @param {HTMLElement} widget  root `.upload-widget` element
 * @param {FileList|Array} files selected files
 * @param {Function} onRemove callback(name) when a file is removed
 */
function renderUploadFileList(widget, files, onRemove) {
    const listEl = widget.querySelector('.upload-file-list');
    if (!listEl) return;
    const arr = Array.from(files || []);
    if (arr.length === 0) { listEl.innerHTML = ''; return; }
    listEl.innerHTML = arr.map((f, i) => `
        <div class="upload-file-item" data-index="${i}">
            <i class="fas fa-file-alt"></i>
            <span class="upload-file-name" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</span>
            <span class="upload-file-size">${formatFileSize(f.size)}</span>
            <button type="button" class="upload-file-remove" data-file="${escapeHTML(f.name)}" title="Remove">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');

    listEl.querySelectorAll('.upload-file-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const name = btn.dataset.file;
            if (onRemove) onRemove(name);
        });
    });
}

/**
 * Validate a set of files against allowed types + max size.
 * @returns {{ok:boolean, message:string}}
 */
function validateUploadFiles(files) {
    const arr = Array.from(files || []);
    for (const file of arr) {
        const typeOk = ALLOWED_ATTACHMENT_TYPES.includes(file.type);
        const sizeOk = file.size <= MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;
        if (!typeOk) return { ok: false, message: `"${file.name}" type is not allowed.` };
        if (!sizeOk) return { ok: false, message: `"${file.name}" exceeds ${MAX_ATTACHMENT_SIZE_MB}MB.` };
    }
    return { ok: true, message: '' };
}

/**
 * Reset a widget's progress UI back to its idle state.
 */
function resetUploadProgress(widget) {
    const wrap = widget.querySelector('.upload-progress-wrap');
    const bar = widget.querySelector('.upload-progress-bar');
    const text = widget.querySelector('.upload-progress-text');
    const status = widget.querySelector('.attachment-upload-status');
    if (wrap) { wrap.classList.remove('visible', 'success', 'error'); }
    if (bar) bar.style.width = '0%';
    if (text) text.textContent = '0%';
    if (status) { status.textContent = ''; status.classList.remove('success', 'error'); }
}

/**
 * Show the progress bar and update its percentage.
 */
function setUploadProgress(widget, pct) {
    const wrap = widget.querySelector('.upload-progress-wrap');
    const bar = widget.querySelector('.upload-progress-bar');
    const text = widget.querySelector('.upload-progress-text');
    if (wrap) wrap.classList.add('visible');
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = pct + '%';
}

/**
 * Mark the widget's progress as complete (success) or failed (error).
 */
function finishUploadProgress(widget, ok) {
    const wrap = widget.querySelector('.upload-progress-wrap');
    const bar = widget.querySelector('.upload-progress-bar');
    const text = widget.querySelector('.upload-progress-text');
    const status = widget.querySelector('.attachment-upload-status');
    if (wrap) {
        wrap.classList.add('visible');
        wrap.classList.remove('success', 'error');
        wrap.classList.add(ok ? 'success' : 'error');
    }
    if (bar) bar.style.width = ok ? '100%' : '0%';
    if (text) text.textContent = ok ? '100%' : '0%';
    if (status) {
        status.classList.remove('success', 'error');
        status.classList.add(ok ? 'success' : 'error');
    }
}

/**
 * Wire up a `.upload-widget` element: dropzone click/over + file selection list.
 * When the dropzone has `data-auto-upload="true"` (Resolve / Revise modals),
 * the selected files are uploaded to Cloudinary immediately instead of waiting
 * for a separate Upload button. Uploaded files are tracked in
 * `autoUploadedAttachments` so the submit handler can attach them to the ticket.
 * @param {HTMLElement} widget  root `.upload-widget` element
 */
function bindUploadDropzone(widget) {
    const dropzone = widget.querySelector('.upload-dropzone');
    const input = widget.querySelector('input[type="file"]');
    if (!dropzone || !input) return;

    // Auto-upload only for widgets marked with data-auto-upload="true"
    const autoUpload = dropzone.dataset.autoUpload === 'true';

    dropzone.addEventListener('click', () => input.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            input.dispatchEvent(new Event('change'));
        }
    });

    input.addEventListener('change', () => {
        if (autoUpload) {
            // Auto-upload the newly selected files right away
            autoUploadSelectedFiles(widget, input.files);
        } else {
            renderUploadFileList(widget, input.files, (name) => {
                // Remove the named file from the current selection
                const dt = new DataTransfer();
                Array.from(input.files).forEach(f => { if (f.name !== name) dt.items.add(f); });
                input.files = dt.files;
                renderUploadFileList(widget, input.files);
                updateUploadWidgetButton(widget);
            });
            updateUploadWidgetButton(widget);
        }
    });
}

// Track attachments uploaded via auto-upload widgets, keyed by widget dropzone id.
// Each entry is an array of Cloudinary attachment objects ready to attach on submit.
const autoUploadedAttachments = {};

/**
 * Upload the given files immediately for an auto-upload widget and render them
 * with a "remove" button so the operator can drop files before submitting.
 * @param {HTMLElement} widget  root `.upload-widget` element
 * @param {FileList} files      the files selected in the dropzone input
 */
async function autoUploadSelectedFiles(widget, files) {
    const dropzone = widget.querySelector('.upload-dropzone');
    const input = widget.querySelector('input[type="file"]');
    const statusEl = widget.querySelector('.attachment-upload-status');
    const arr = Array.from(files || []);
    if (arr.length === 0) return;

    const key = dropzone.id || 'auto';
    if (!autoUploadedAttachments[key]) autoUploadedAttachments[key] = [];

    if (!isCloudinaryConfigured()) {
        if (statusEl) { statusEl.textContent = '⚠️ Cloudinary not configured.'; statusEl.classList.add('error'); }
        return;
    }

    const v = validateUploadFiles(arr);
    if (!v.ok) {
        if (statusEl) { statusEl.textContent = v.message; statusEl.classList.add('error'); }
        if (widget) finishUploadProgress(widget, false);
        return;
    }

    const btn = widget.querySelector('.btn-upload-now');
    if (btn) btn.disabled = true;
    if (statusEl) { statusEl.textContent = 'Uploading...'; statusEl.classList.remove('success', 'error'); }
    if (widget) resetUploadProgress(widget);

    try {
        const ticketId = autoUploadTicketId.get(widget) || 'resolve';
        for (const file of arr) {
            const att = await cloudinaryUpload(file, ticketId, (pct) => {
                if (widget) setUploadProgress(widget, pct);
            });
            autoUploadedAttachments[key].push(att);
        }
        if (widget) finishUploadProgress(widget, true);
        if (statusEl) {
            statusEl.textContent = `${autoUploadedAttachments[key].length} file(s) ready.`;
            statusEl.classList.add('success');
        }
        // Clear the input so the same file can be re-selected later
        if (input) input.value = '';
        renderAutoUploadFileList(widget);
    } catch (error) {
        console.error('Auto-upload error:', error);
        if (statusEl) { statusEl.textContent = 'Upload failed: ' + error.message; statusEl.classList.add('error'); }
        if (widget) finishUploadProgress(widget, false);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Map widget -> ticket id used for the Cloudinary folder path during auto-upload
const autoUploadTicketId = new WeakMap();

/**
 * Render the list of already-uploaded attachments for an auto-upload widget,
 * each with a remove (×) button so the operator can deselect a file before
 * submitting the resolution.
 * @param {HTMLElement} widget  root `.upload-widget` element
 */
function renderAutoUploadFileList(widget) {
    const dropzone = widget.querySelector('.upload-dropzone');
    const listEl = widget.querySelector('.upload-file-list');
    if (!listEl || !dropzone) return;
    const key = dropzone.id || 'auto';
    const atts = autoUploadedAttachments[key] || [];
    if (atts.length === 0) { listEl.innerHTML = ''; return; }
    listEl.innerHTML = atts.map((att, i) => {
        const url = att.secure_url || '';
        const name = att.name || 'Attachment ' + (i + 1);
        const sizeText = att.bytes ? formatFileSize(att.bytes) : '';
        const isImage = att.resource_type === 'image';
        const isVideo = att.resource_type === 'video';
        const icon = getAttachmentIcon(att.resource_type, att.format);
        const color = getAttachmentColor(att.format);

        let preview;
        if (isImage) {
            preview = `<img class="upload-file-thumb" src="${url}" alt="${escapeHTML(name)}" loading="lazy"
                onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';">`;
            preview += `<span class="upload-file-icon" style="display:none;"><i class="fas ${icon}" style="color:${color}"></i></span>`;
        } else if (isVideo) {
            preview = `<video class="upload-file-thumb" src="${url}" muted preload="metadata"></video>`;
            preview += `<span class="upload-file-play"><i class="fas fa-play"></i></span>`;
        } else {
            preview = `<span class="upload-file-icon"><i class="fas ${icon}" style="color:${color}"></i></span>`;
        }

        return `
            <div class="upload-file-item" data-index="${i}">
                <a class="upload-file-preview" href="${url}" target="_blank" rel="noopener noreferrer" title="${escapeHTML(name)}">
                    ${preview}
                </a>
                <div class="upload-file-info">
                    <span class="upload-file-name" title="${escapeHTML(name)}">${escapeHTML(name)}</span>
                    ${sizeText ? `<span class="upload-file-size">${sizeText}</span>` : ''}
                </div>
                <button type="button" class="upload-file-remove" data-index="${i}" title="Remove file">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('.upload-file-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            autoUploadedAttachments[key] = (autoUploadedAttachments[key] || []).filter((_, i) => i !== idx);
            renderAutoUploadFileList(widget);
        });
    });
}

/**
 * Clear the auto-uploaded attachments list for a widget (used when the modal
 * is closed or a resolution is submitted).
 * @param {HTMLElement} widget  root `.upload-widget` element
 */
function resetAutoUpload(widget) {
    const dropzone = widget.querySelector('.upload-dropzone');
    const listEl = widget.querySelector('.upload-file-list');
    if (dropzone) {
        const key = dropzone.id || 'auto';
        autoUploadedAttachments[key] = [];
    }
    if (listEl) listEl.innerHTML = '';
}

function updateUploadWidgetButton(widget) {
    const input = widget.querySelector('input[type="file"]');
    const btn = widget.querySelector('.btn-upload-now');
    if (btn && input) btn.disabled = !(input.files && input.files.length > 0);
}

/**
 * Initialize all `.upload-widget` elements on the page with dropzone behavior.
 * Call once on DOMContentLoaded.
 */
function initAllUploadWidgets() {
    document.querySelectorAll('.upload-widget').forEach(widget => {
        bindUploadDropzone(widget);
        updateUploadWidgetButton(widget);
    });
}

async function removeTicketAttachment(publicId) {
    if (!currentTicketId || !publicId) return;
    const confirmed = await showConfirmDialog({
        title: 'Remove Attachment',
        message: 'Remove this attachment from the ticket?',
        confirmText: 'Remove',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmed) return;

    try {
        const ticketDoc = await db.collection('tickets').doc(currentTicketId).get();
        if (!ticketDoc.exists) return;
        const data = ticketDoc.data();
        const existing = Array.isArray(data.attachments) ? data.attachments : [];
        const oldResolution = data.resolution || {};
        const oldResAtts = Array.isArray(oldResolution.attachments) ? oldResolution.attachments : [];
        const remaining = existing.filter(a => a.public_id !== publicId);
        const remainingRes = oldResAtts.filter(a => a.public_id !== publicId);
        await db.collection('tickets').doc(currentTicketId).update({
            attachments: remaining,
            resolutionAttachmentUrl: remaining.length > 0 ? remaining[0].secure_url : '',
            resolution: {
                ...oldResolution,
                attachments: remainingRes
            }
        });

        const idx = allTickets.findIndex(t => t.id === currentTicketId);
        if (idx !== -1) {
            allTickets[idx].attachments = remaining;
            if (allTickets[idx].resolution) {
                allTickets[idx].resolution.attachments = remainingRes;
            }
            renderTicketAttachments(allTickets[idx]);
        }
        setAttachmentStatus('Attachment removed.', false);
        setTimeout(() => setAttachmentStatus(''), 3000);
    } catch (error) {
        console.error('Remove attachment error:', error);
        setAttachmentStatus('Failed to remove attachment.', true);
    }
}

window.openTicketModal = function(id) {
    const ticket = allTickets.find(t => t.id === id);
    if (!ticket) return;

    // ===== Diagnostic: verify the ticket data contains the requester's attachments =====
    console.log(`[Ticket] ${ticket.ticketNumber || id} attachments:`, Array.isArray(ticket.attachments) ? ticket.attachments : 'none');

    currentTicketId = id;
    captureMainState({ tab: getActiveMainTab() || 'tickets', modal: 'ticket', id });
    modalTicketTitle.textContent = `Ticket: ${ticket.ticketNumber || ticket.id}`;

    // ===== Rejection reason (For Revision tickets) — operators can see why the
    //       superadmin sent the resolution back before clicking "Revise & Resubmit" =====
    const rejectionObj = ticket.rejection || {};
    const rejectionReason = rejectionObj.reason || ticket.rejectionReason || '';
    const rejectedBy = rejectionObj.rejectedBy || ticket.rejectedBy || '';
    const rejectedAt = rejectionObj.rejectedAt?.toDate ? formatDateTime(rejectionObj.rejectedAt.toDate()) : (rejectionObj.rejectedAt || '');
    const isForRevision = (ticket.status || '') === 'For Revision' || (ticket.approvalStatus || '') === 'rejected';
    const rejectionHTML = (isForRevision && rejectionReason) ? `
        <div class="rejection-reason-box" style="grid-column:span 2;margin-bottom:6px;">
            <i class="fas fa-exclamation-circle"></i>
            <div>
                <strong>Rejection Reason</strong>
                <p>${escapeHTML(rejectionReason)}</p>
                ${(rejectedBy || rejectedAt) ? `<p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">${rejectedBy ? 'Rejected by ' + escapeHTML(rejectedBy) : ''}${rejectedAt ? (rejectedBy ? ' on ' : '') + escapeHTML(rejectedAt) : ''}</p>` : ''}
            </div>
        </div>
    ` : '';

    // ===== Resolution details (approved / submitted resolutions) =====
    const resolution = ticket.resolution || {};
    const resNotes = resolution.notes || ticket.resolutionNotes || '';
    const resBy = resolution.resolvedBy || '';
    const resAt = resolution.resolvedAt?.toDate ? formatDateTime(resolution.resolvedAt.toDate()) : (resolution.resolvedAt || '');
    const resolutionHTML = (resNotes || resBy || resAt) ? `
        <div class="modal-field full-width"><label>Resolution Notes</label><span>${escapeHTML(resNotes || '\u2014')}</span></div>
        ${(resBy || resAt) ? `<div class="modal-field full-width"><label>Resolution Info</label><span>${escapeHTML(resBy ? 'Resolved by ' + resBy : '')}${resAt ? (resBy ? ' on ' : '') + escapeHTML(resAt) : ''}</span></div>` : ''}
    ` : '';

    // ===== Additional Footage Requests (from "Request Additional" on the track page) =====
    const footageNotes = (ticket.comments || []).filter(function(c) { return c && c.type === 'footage_request'; });
    const footageHTML = footageNotes.length ? `
        <div class="modal-field full-width"><label>Additional Footage Requests</label>
            ${footageNotes.map(function(n) {
                const reqAt = (n.requestedAt && typeof n.requestedAt.toDate === 'function') ? formatDate(n.requestedAt.toDate()) : '';
                return `<div class="rejection-reason-box" style="margin-top:6px;">
                    <i class="fas fa-video"></i>
                    <div>
                        <p>${escapeHTML(n.text || '')}</p>
                        ${(n.requestedBy || reqAt) ? `<p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">Requested by ${escapeHTML(n.requestedBy || 'Unknown')}${reqAt ? ' on ' + escapeHTML(reqAt) : ''}</p>` : ''}
                    </div>
                </div>`;
            }).join('')}
        </div>
    ` : '';

    ticketModalBody.innerHTML = `
        <div class="modal-section-title"><i class="fas fa-user-circle"></i> Requester Information</div>
        <div class="modal-field"><label>Branch</label><span>${escapeHTML(ticket.branch || '-')}</span></div>
        <div class="modal-field"><label>Reporter Name</label><span>${escapeHTML(ticket.name || '-')}</span></div>
        <div class="modal-field"><label>Position</label><span>${escapeHTML(ticket.position || '-')}</span></div>
        <div class="modal-field"><label>Contact Number</label><span>${escapeHTML(ticket.contact || '-')}</span></div>
        <div class="modal-field"><label>Email</label><span>${escapeHTML(ticket.email || '-')}</span></div>

        <div class="modal-section-title"><i class="fas fa-clipboard-list"></i> Incident Details</div>
        <div class="modal-field"><label>Ticket Number</label><span>${escapeHTML(ticket.ticketNumber || ticket.id)}</span></div>
        <div class="modal-field"><label>Incident Date</label><span>${escapeHTML(ticket.datetime || '-')}</span></div>
        <div class="modal-field"><label>Location</label><span>${escapeHTML(ticket.location || '-')}</span></div>
        <div class="modal-field"><label>Incident Type</label><span>${escapeHTML(ticket.incident || '-')}</span></div>
        <div class="modal-field"><label>Priority</label><span>${escapeHTML(ticket.priority || 'Low')}</span></div>
        <div class="modal-field full-width"><label>Full Description</label><span>${escapeHTML(ticket.description || 'No description.')}</span></div>
        ${rejectionHTML}
        ${resolutionHTML}
        ${footageHTML}
    `;
    const attachmentsSection = document.getElementById('ticketAttachmentsSection');
    if (attachmentsSection) attachmentsSection.style.display = '';

    renderTicketAttachments(ticket);
    ticketModal.classList.add('active');
};

if (closeTicketModal) closeTicketModal.addEventListener('click', () => { ticketModal.classList.remove('active'); try { clearMainModalCtx(); } catch (e) { /* ignore */ } });

window.openEditTicket = function(id) {
    const ticket = allTickets.find(t => t.id === id);
    if (!ticket) return;

    // ===== Populate the branch dropdown (used by the Tickets tab AND the
    //       "Edit Ticket Info" button inside the approval details modal) =====
    const editBranchSel = document.getElementById('editBranch');
    if (editBranchSel) {
        editBranchSel.innerHTML = branches.map(b =>
            `<option value="${escapeHTML(b.branchName)}">${escapeHTML(b.branchName)}</option>`
        ).join('');
    }

    document.getElementById('editTicketId').value = id;
    if (editBranchSel) editBranchSel.value = ticket.branch || '';
    document.getElementById('editPriority').value = ticket.priority || 'Low';
    document.getElementById('editName').value = ticket.name || '';
    document.getElementById('editPosition').value = ticket.position || '';
    document.getElementById('editContact').value = ticket.contact || '';
    document.getElementById('editEmail').value = ticket.email || '';
    document.getElementById('editDatetime').value = ticket.datetime || '';
    document.getElementById('editLocation').value = ticket.location || '';
    document.getElementById('editIncident').value = ticket.incident || '';
    document.getElementById('editDescription').value = ticket.description || '';
    document.getElementById('editStatus').value = ticket.status || 'Pending';

    editModalTitle.textContent = `Edit Ticket: ${ticket.ticketNumber || ticket.id}`;
    editTicketModal.classList.add('active');
};

if (closeEditModal) closeEditModal.addEventListener('click', () => editTicketModal.classList.remove('active'));

window.closeTicketModals = function() {
    if (ticketModal) ticketModal.classList.remove('active');
    if (editTicketModal) editTicketModal.classList.remove('active');
    try { clearMainModalCtx(); } catch (e) { /* ignore */ }
};

window.saveEditTicket = async function() {
    const id = document.getElementById('editTicketId').value;
    const updatedData = {
        branch: document.getElementById('editBranch').value,
        priority: document.getElementById('editPriority').value,
        name: document.getElementById('editName').value,
        position: document.getElementById('editPosition').value,
        contact: document.getElementById('editContact').value,
        email: document.getElementById('editEmail').value,
        datetime: document.getElementById('editDatetime').value,
        location: document.getElementById('editLocation').value,
        incident: document.getElementById('editIncident').value,
        description: document.getElementById('editDescription').value,
        status: document.getElementById('editStatus').value
    };

    // ===== If an edit sets a ticket to Resolved, route it through the approval queue =====
    if (updatedData.status === 'Resolved') {
        // Preserve existing attachments instead of wiping them out
        const existingTicket = allTickets.find(t => t.id === id) || {};
        const existingAtt = Array.isArray(existingTicket.attachments) ? existingTicket.attachments : [];
        const oldResolution = existingTicket.resolution || {};
        const existingResAtt = Array.isArray(oldResolution.attachments) ? oldResolution.attachments : [];

        updatedData.approvalStatus = 'pending_approval';
        updatedData.resolutionNotes = updatedData.resolutionNotes || 'Edited to Resolved.';
        updatedData.resolutionAttachmentUrl = existingAtt.length > 0 ? existingAtt[0].secure_url : '';
        updatedData.attachments = existingAtt;
        // Clear any previous rejection data when resubmitting
        updatedData.rejectionReason = firebase.firestore.FieldValue.delete();
        updatedData.rejection = firebase.firestore.FieldValue.delete();
        updatedData.resolution = {
            notes: updatedData.resolutionNotes,
            attachments: existingResAtt.length > 0 ? existingResAtt : existingAtt,
            resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            resolvedBy: (auth.currentUser && auth.currentUser.email) || 'unknown'
        };
    }

    try {
        await firestoreService.updateTicket(id, updatedData);
        console.log('Ticket updated successfully');
        editTicketModal.classList.remove('active');
    } catch (error) {
        console.log('Failed to save changes');
    }
};

window.updateBulkBar = function() {
    const checked = document.querySelectorAll('.ticket-checkbox:checked');
    if (checked.length > 0) {
        bulkBar.classList.add('visible');
        bulkCount.textContent = checked.length;
    } else {
        bulkBar.classList.remove('visible');
    }
};

window.selectAllTickets = function() {
    const checkboxes = document.querySelectorAll('.ticket-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
    updateBulkBar();
};

window.bulkAction = async function(action) {
    const checked = document.querySelectorAll('.ticket-checkbox:checked');
    if (checked.length === 0) { console.log('No tickets selected'); return; }

    let label = '', newStatus = null, isDelete = false;
    if (action === 'progress') { label = 'Mark In Progress'; newStatus = 'In Progress'; }
    else if (action === 'resolve') { label = 'Mark Resolved'; newStatus = 'Resolved'; }
    else if (action === 'delete') { label = 'Delete'; isDelete = true; }

    const confirmed = await showConfirmDialog({
        title: 'Confirm Bulk Action',
        message: `Are you sure you want to <strong>${escapeHTML(label)}</strong> ${checked.length} ticket(s)?`,
        confirmText: 'Continue',
        danger: isDelete,
        icon: isDelete ? 'fa-trash-alt' : 'fa-check-circle'
    });
    if (!confirmed) return;

    try {
        for (const cb of checked) {
            const id = cb.value;
            if (isDelete) { await firestoreService.deleteTicket(id); } 
            else if (action === 'resolve') {
                // ===== Bulk Resolve: route through superadmin approval queue =====
                const ticket = allTickets.find(t => t.id === id);
                const resolvedBy = (auth.currentUser && auth.currentUser.email) || 'unknown';
                await firestoreService.updateTicket(id, {
                    status: 'Resolved',
                    approvalStatus: 'pending_approval',
                    // Clear any previous rejection data when resubmitting
                    rejectionReason: firebase.firestore.FieldValue.delete(),
                    rejection: firebase.firestore.FieldValue.delete(),
                    resolution: {
                        notes: 'Bulk resolved.',
                        attachments: [],
                        resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        resolvedBy
                    },
                    resolutionNotes: 'Bulk resolved.',
                    resolutionAttachmentUrl: ''
                });
            }
            else { await firestoreService.updateTicket(id, { status: newStatus }); }
        }
        console.log(`${checked.length} ticket(s) ${isDelete ? 'deleted' : 'updated'}`);
        document.querySelectorAll('.ticket-checkbox').forEach(cb => cb.checked = false);
        if (selectAll) selectAll.checked = false;
        updateBulkBar();
    } catch (error) {
        console.log('Failed to perform bulk action');
    }
};

if (ticketSearchBtn) ticketSearchBtn.addEventListener('click', filterTickets);
if (ticketSearch) ticketSearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') filterTickets(); });
if (ticketStatusFilter) ticketStatusFilter.addEventListener('change', filterTickets);
if (ticketBranchFilter) ticketBranchFilter.addEventListener('change', filterTickets);
if (ticketPriorityFilter) ticketPriorityFilter.addEventListener('change', filterTickets);

if (ticketForm) {
    ticketForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const branch = document.getElementById('branch').value;
        const priority = document.getElementById('priority').value;

        if (!branch) { console.log('Please select a branch.'); return; }

        try {
            const ticketID = await firestoreService.generateTicketNumber(branch);
            const attachmentsData = document.getElementById('submitAttachmentsData').value;
            const ticketData = {
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
                attachments: attachmentsData ? JSON.parse(attachmentsData) : [],
                priority: priority || 'Low',
                status: 'Pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await firestoreService.setTicket(ticketID, ticketData);
            console.log(`Ticket submitted! No: ${ticketID}`);
            ticketForm.reset();
            document.getElementById('submitAttachmentsGrid').innerHTML = '';
            document.getElementById('submitAttachmentsGrid').style.display = 'none';
            document.getElementById('submitAttachmentsData').value = '[]';
            switchTab('tickets');
        } catch (error) {
            console.log('Failed to submit ticket.');
        }
    });
}

// ==============================================================
//  PRINTABLE MONTHLY REPORT & NAVIGATION
// ==============================================================

async function generateMonthlyIncidents(targetMonth) {
    // `targetMonth` is the first day of the month to report on. Falls back to
    // the current month when omitted.
    const baseDate = targetMonth || new Date();
    const startOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
    const endOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59);

    const startMs = startOfMonth.getTime();
    const endMs = endOfMonth.getTime();

    const monthLogs = allLogs.filter(log => {
        const t = log.dateTime?.toDate?.()?.getTime() || new Date(log.dateTime).getTime();
        return t >= startMs && t <= endMs;
    });

    const grouped = {};
    for (const log of monthLogs) {
        const name = log.branchName;
        if (!grouped[name]) grouped[name] = [];
        grouped[name].push(log);
    }

    const branchIncidents = {};
    for (const [branchName, logs] of Object.entries(grouped)) {
        const sorted = [...logs].sort((a, b) => {
            const aT = a.dateTime?.toDate?.()?.getTime() || new Date(a.dateTime).getTime();
            const bT = b.dateTime?.toDate?.()?.getTime() || new Date(b.dateTime).getTime();
            return aT - bT;
        });

        const incidents = [];
        let incidentCount = 0;
        let offlineStart = null;
        let offlineRemarks = '';

        for (const log of sorted) {
            const d = log.dateTime?.toDate ? log.dateTime.toDate() : new Date(log.dateTime);
            if (log.status === 'Offline' && offlineStart === null) {
                offlineStart = d;
                offlineRemarks = (log.remarks || '').trim();
            } else if (log.status === 'Online' && offlineStart !== null) {
                incidentCount++;
                const durationMinutes = getDurationMinutes(offlineStart, d);
                const onlineRemarks = (log.remarks || '').trim();
                const incidentRemarks = [];
                if (offlineRemarks) incidentRemarks.push(offlineRemarks);
                if (onlineRemarks) incidentRemarks.push(onlineRemarks);
                incidents.push({
                    incidentNumber: incidentCount,
                    dateTimeOffline: offlineStart,
                    dateTimeRestored: d,
                    duration: formatDuration(durationMinutes),
                    durationMinutes: durationMinutes,
                    remarks: incidentRemarks
                });
                offlineStart = null;
                offlineRemarks = '';
            }
        }

        if (offlineStart !== null) {
            const branch = branches.find(b => b.branchName === branchName);
            const now = new Date();
            const isCurrentMonth = baseDate.getFullYear() === now.getFullYear() && baseDate.getMonth() === now.getMonth();

            if (branch && branch.currentStatus === 'Offline' && isCurrentMonth) {
                // ===== Current month + still offline right now: mark as ongoing =====
                incidentCount++;
                const durMinutes = getDurationMinutes(offlineStart, now);
                incidents.push({
                    incidentNumber: incidentCount,
                    dateTimeOffline: offlineStart,
                    dateTimeRestored: null,
                    duration: formatDuration(durMinutes) + ' (ongoing)',
                    durationMinutes: durMinutes,
                    remarks: offlineRemarks ? [offlineRemarks] : []
                });
            } else if (!isCurrentMonth) {
                // ===== Past month: a not-yet-restored outage is capped at month-end =====
                incidentCount++;
                const durMinutes = getDurationMinutes(offlineStart, endOfMonth);
                incidents.push({
                    incidentNumber: incidentCount,
                    dateTimeOffline: offlineStart,
                    dateTimeRestored: endOfMonth,
                    duration: formatDuration(durMinutes),
                    durationMinutes: durMinutes,
                    remarks: offlineRemarks ? [offlineRemarks] : []
                });
            }
        }

        if (incidents.length > 0) branchIncidents[branchName] = incidents;
    }

    return branchIncidents;
}

async function printMonthlyReport() {
    const now = new Date();
    // ===== Honor the report month selected in the History tab =====
    const reportMonth = getSelectedReportMonth();
    const monthName = reportMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const som = new Date(reportMonth.getFullYear(), reportMonth.getMonth(), 1);
    const eom = new Date(reportMonth.getFullYear(), reportMonth.getMonth() + 1, 0, 23, 59, 59);

    const periodEl = document.getElementById('printReportPeriod');
    const genDateEl = document.getElementById('printGeneratedDate');
    if (periodEl) periodEl.textContent = `${monthName} (${formatDate(som)} \u2014 ${formatDate(eom)})`;
    if (genDateEl) genDateEl.textContent = `${formatDate(now)} at ${formatTime(now)}`;

    const reportBody = document.getElementById('printReportBody');
    if (!reportBody) return;
    
    const branchIncidents = await generateMonthlyIncidents(reportMonth);

    if (Object.keys(branchIncidents).length === 0) {
        reportBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#666;"><em>No incidents recorded for ${monthName}.</em></td></tr>`;
    } else {
        const branchNames = Object.keys(branchIncidents).sort();
        let html = '';
        for (const branchName of branchNames) {
            const incidents = branchIncidents[branchName];
            const totalIncidents = incidents.length;

            const incidentNumbers = incidents.map(inc => inc.incidentNumber).join('<br>');
            const offlineTimes = incidents.map(inc => formatDate(inc.dateTimeOffline) + ', ' + formatTime(inc.dateTimeOffline)).join('<br>');
            const restoredTimes = incidents.map(inc => inc.dateTimeRestored ? formatDate(inc.dateTimeRestored) + ', ' + formatTime(inc.dateTimeRestored) : '\u2014 (ongoing)').join('<br>');
            const durations = incidents.map(inc => inc.duration).join('<br>');
            const remarksCol = incidents.map(inc => {
                if (inc.remarks && inc.remarks.length > 0) {
                    return inc.remarks.map(r => escapeHTML(r)).join(' | ');
                }
                return '';
            }).join('<br>');

            html += `
                <tr>
                    <td class="print-branch-name"><strong>${escapeHTML(branchName)}</strong></td>
                    <td class="print-total-incidents">${totalIncidents}</td>
                    <td class="print-incident-no">${incidentNumbers}</td>
                    <td class="print-offline-time">${offlineTimes}</td>
                    <td class="print-restored-time">${restoredTimes}</td>
                    <td class="print-duration">${durations}</td>
                    <td class="print-remarks">${remarksCol}</td>
                </tr>
            `;
        }
        reportBody.innerHTML = html;
    }
    window.print();
}

async function switchTab(tabId) {
    // Switching tabs dismisses any pending "re-open modal on refresh" flag.
    clearMainModalCtx();

    // ===== Superadmin-only tabs guard: operators cannot access approvals/user management =====
    if ((tabId === 'users' || tabId === 'approvals') && !currentUserIsSuperAdmin()) {
        tabId = 'dashboard';
    }

    navItems.forEach(item => { item.classList.toggle('active', item.dataset.tab === tabId); });
    tabContents.forEach(tab => { tab.classList.toggle('active', tab.id === `tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`); });

    const titles = { dashboard: 'Dashboard', branches: 'Branch Monitor', history: 'Status History', tickets: 'Tickets', users: 'Pending Approvals', approvals: 'Ticket Approvals' };
    const subtitles = { dashboard: 'Overview & Analytics', branches: 'Real-time Branch Health Status', history: 'Status Change Logs', tickets: 'Incident Ticket Management', users: 'Review new owner sign-ups', approvals: 'Superadmin Approval Workflow' };
    if (pageTitle) pageTitle.textContent = titles[tabId] || 'Dashboard';
    if (pageSubtitle) pageSubtitle.textContent = subtitles[tabId] || '';

    if (tabId === 'users' && typeof loadSuperadminUsers === 'function') {
        await loadSuperadminUsers();
    }

    // ===== Render approval list + filters when the Approvals tab opens =====
    if (tabId === 'approvals') {
        populateApprovalBranchFilter();
                if (typeof filterApprovalTickets === 'function') {
            filterApprovalTickets();
        }
        if (typeof renderApprovalList === 'function') {
            renderApprovalList();
        }
    }

    // ===== Remember this tab so a refresh keeps the user here, not on Dashboard =====
    captureMainState({ tab: tabId });
}

window.switchTab = switchTab;

navItems.forEach(item => {
    item.addEventListener('click', async (e) => {
        e.preventDefault();
        await switchTab(item.dataset.tab);
    });
});

if (userStatusFilter) {
    userStatusFilter.addEventListener('change', loadSuperadminUsers);
}

if (searchInput) searchInput.addEventListener('input', debounce(renderBranchesTable));
if (historySearch) historySearch.addEventListener('input', debounce(renderHistory));

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderBranchesTable();
    });
});

historyFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        historyFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderHistory();
    });
});

if (sortSelect) sortSelect.addEventListener('change', renderBranchesTable);
if (groupFilter) groupFilter.addEventListener('change', renderBranchesTable);
if (downtimeFilter) downtimeFilter.addEventListener('change', renderBranchesTable);

if (historyBranchFilter) historyBranchFilter.addEventListener('change', renderHistory);
if (historyDateFrom) historyDateFrom.addEventListener('input', renderHistory);
if (historyDateTo) historyDateTo.addEventListener('input', renderHistory);
if (btnPrintReport) btnPrintReport.addEventListener('click', printMonthlyReport);

// ==============================================================
//  BRANCH LIST MANAGEMENT MODAL
// ==============================================================

function renderBranchList() {
    if (!branchListBody) return;
    if (branches.length === 0) {
        branchListBody.innerHTML = '<tr><td colspan="3" class="empty-state"><i class="fas fa-database"></i><p>No branches.</p></td></tr>';
        return;
    }
    const isAdmin = currentUserIsSuperAdmin();
    branchListBody.innerHTML = branches.map(b => {
        const sc = b.currentStatus === 'Online' ? 'online' : 'offline';
        return `<tr>
            <td><strong>${escapeHTML(b.branchName)}</strong></td>
            <td><span class="status-badge ${sc}">${escapeHTML(b.currentStatus)}</span></td>
            <td>
                ${isAdmin ? `<button class="action-btn delete-action btn-remove-branch" data-branch="${escapeHTML(b.branchName)}" data-tooltip="Remove"><i class="fas fa-trash"></i></button>` : '\u2014'}
            </td>
        </tr>`;
    }).join('');
    
    // Use event delegation instead of inline onclick to avoid escapeHTML issues in JS strings
    branchListBody.querySelectorAll('.btn-remove-branch').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = btn.dataset.branch;
            if (name) window.confirmRemoveBranch(name);
        });
    });
}

if (btnManageBranches) {
    btnManageBranches.addEventListener('click', () => {
        renderBranchList();
        if (branchListModal) branchListModal.classList.add('active');
    });
}

if (closeBranchListModal) {
    closeBranchListModal.addEventListener('click', () => {
        if (branchListModal) branchListModal.classList.remove('active');
    });
}

if (closeBranchListBtn) {
    closeBranchListBtn.addEventListener('click', () => {
        if (branchListModal) branchListModal.classList.remove('active');
    });
}

if (branchListModal) {
    branchListModal.addEventListener('click', (e) => {
        if (e.target === branchListModal) branchListModal.classList.remove('active');
    });
}

if (btnAddNewBranch) {
    btnAddNewBranch.addEventListener('click', async () => {
        const name = newBranchNameInput.value.trim();
        if (!name) {
            console.log('Please enter a branch name.');
            return;
        }
        const existing = branches.find(b => b.branchName.toLowerCase() === name.toLowerCase());
        if (existing) {
            console.log(`Branch "${name}" already exists.`);
            return;
        }
        try {
            await firestoreService.setBranch(name, {
                branchName: name,
                currentStatus: 'Online',
                lastUpdated: firebase.firestore.Timestamp.fromDate(new Date()),
                currentDowntimeStart: null,
                remarks: ''
            });
            branches.push({
                branchName: name,
                currentStatus: 'Online',
                lastUpdated: firebase.firestore.Timestamp.fromDate(new Date()),
                currentDowntimeStart: null,
                remarks: ''
            });
            branches.sort((a, b) => (a.branchName || '').localeCompare(b.branchName || ''));
            newBranchNameInput.value = '';
            renderBranchList();
            reRenderAll();
        } catch (error) {
            console.error('Add branch error:', error);
            console.log('Failed to add branch.');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initAllUploadWidgets();
    initApp();
});
