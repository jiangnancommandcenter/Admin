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

// ==============================================================
//  DOM REFERENCES
// ==============================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Sidebar
const sidebar = $('#sidebar');
const sidebarToggle = $('#sidebarToggle');
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
//  AUTH STATE
// ==============================================================

auth.onAuthStateChanged((user) => {
    if (!authStatusText) return;
    if (user) {
        authStatusText.textContent = user.email || 'Logged In';
        if (logoutBtn) logoutBtn.style.display = 'flex';
        if (loginBtnSidebar) loginBtnSidebar.style.display = 'none';
    } else {
        authStatusText.textContent = 'Not logged in';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (loginBtnSidebar) loginBtnSidebar.style.display = 'flex';
    }
});

if (loginBtnSidebar) {
    loginBtnSidebar.addEventListener('click', () => {
        window.location.href = 'login.html';
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        window.handleLogout();
    });
}

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

async function initApp() {
    try {
        initDateTime();
        setDefaultDateTime();
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

            await firestoreService.addStatusLog({ branchName: name, status: 'Offline', dateTime: d1.toISOString(), remarks: 'Scheduled maintenance' });
            await firestoreService.addStatusLog({ branchName: name, status: 'Online', dateTime: d2.toISOString(), remarks: 'Maintenance completed' });
            await firestoreService.addStatusLog({ branchName: name, status: 'Offline', dateTime: d3.toISOString(), remarks: 'Power interruption' });
            await firestoreService.addStatusLog({ branchName: name, status: 'Online', dateTime: d4.toISOString(), remarks: 'Power restored' });
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

    if (filtered.length === 0) {
        branchesTableBody.innerHTML = `<tr><td colspan="5" class="empty-state"><i class="fas fa-search"></i><p>No branches match.</p></td></tr>`;
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
                        <button class="btn-remove" data-tooltip="Remove" data-branch="${escapeHTML(b.branchName)}"><i class="fas fa-trash-alt"></i></button>
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
                    <button class="btn-remove" data-tooltip="Remove" data-branch="${escapeHTML(b.branchName)}"><i class="fas fa-trash-alt"></i></button>
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
}

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
    if (!confirm('Are you sure you want to delete this history record?')) return;
    
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
    if (!confirm(`Remove "${name}"?\nHistory logs will be kept.`)) return;
    
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

    historyTableBody.innerHTML = filtered.map(log => {
        const d = log.dateTime?.toDate ? log.dateTime.toDate() : new Date(log.dateTime);
        const sc = log.status === 'Online' ? 'online' : 'offline';
        const logId = log.id || '';
        return `<tr>
            <td>${formatDate(d)}</td>
            <td>${formatTime(d)}</td>
            <td><strong>${escapeHTML(log.branchName)}</strong></td>
            <td><span class="status-badge ${sc}">${escapeHTML(log.status)}</span></td>
            <td>${escapeHTML(log.remarks || '\u2014')}</td>
            <td>
                <div class="action-group">
                    <button class="history-action-btn edit-hist" data-logid="${escapeHTML(logId)}" data-tooltip="Edit" onclick="window.openEditHistoryModal('${escapeHTML(logId)}')"><i class="fas fa-pen"></i></button>
                    <button class="history-action-btn delete-hist" data-logid="${escapeHTML(logId)}" data-tooltip="Delete" onclick="window.deleteHistoryLog('${escapeHTML(logId)}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
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

function closeViewModalFn() { viewModal.classList.remove('active'); currentViewBranch = null; }

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

    // ===== Desktop Notification Feature: Initialize notification system =====
    if (typeof window.initNotifications === 'function') {
        window.initNotifications();
    }

    firestoreService.listenTickets((tickets, changes) => {
        if (isFirstSnapshot) {
            if (tickets.length > 0) {
                allTickets = tickets;
                filterTickets();
                updateTicketDashboard();
                updatePendingBadge();
            } else if (allTickets.length > 0) {
                filterTickets();
                updateTicketDashboard();
                updatePendingBadge();
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

                    // ===== Desktop Notification Feature: Queue notification for new ticket =====
                    if (typeof window.queueNotification === 'function') {
                        window.queueNotification(ticket);
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
        { branch: 'MOA', name: 'Maria Santos', position: 'Supervisor', contact: '09179876543', email: 'maria@example.com', datetime: '02/15/2025 0930H', location: 'Dining Area', incident: 'Overcharge Discrepancy', description: 'Customer complained about being overcharged PHP 250 on their bill. Need to check POS records.', priority: 'Medium' }
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
                priority: ticket.priority || 'Medium',
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
    const resolved = allTickets.filter(t => t.status === 'Resolved').length;

    if (totalTickets) totalTickets.textContent = total;
    if (pendingTickets) pendingTickets.textContent = pending;
    if (progressTickets) progressTickets.textContent = progress;
    if (resolvedTickets) resolvedTickets.textContent = resolved;
}

function updatePendingBadge() {
    const pending = allTickets.filter(t => (t.status || 'Pending') === 'Pending').length;
    if (pending > 0) {
        pendingBadge.style.display = 'inline';
        pendingBadge.textContent = pending;
    } else {
        pendingBadge.style.display = 'none';
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
        const statusMatch = selectedStatus === 'all' || (ticket.status || 'Pending') === selectedStatus;
        const priorityMatch = selectedPriority === 'all' || (ticket.priority || 'Medium') === selectedPriority;
        const branchMatch = selectedBranch === 'all' || ticket.branch === selectedBranch;
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
        const priority = ticket.priority || 'Medium';
        const dotClass = priority.toLowerCase();

        let actionHTML = '';
        if (status === 'Pending') {
            actionHTML = `<div class="action-group">
                <button class="action-btn start" data-tooltip="Start" onclick="window.startTicket('${ticket.id}')">\u25B6</button>
                <button class="action-btn edit" data-tooltip="Edit" onclick="window.openEditTicket('${ticket.id}')">\u270E</button>
                <button class="action-btn delete-action" data-tooltip="Delete" onclick="window.deleteTicket('${ticket.id}')">\uD83D\uDDD1</button>
            </div>`;
        } else if (status === 'In Progress') {
            actionHTML = `<div class="action-group">
                <button class="action-btn resolve" data-tooltip="Resolve" onclick="window.resolveTicket('${ticket.id}')">\u2713</button>
                <button class="action-btn edit" data-tooltip="Edit" onclick="window.openEditTicket('${ticket.id}')">\u270E</button>
                <button class="action-btn delete-action" data-tooltip="Delete" onclick="window.deleteTicket('${ticket.id}')">\uD83D\uDDD1</button>
            </div>`;
        } else {
            actionHTML = `<div class="action-group">
                <button class="action-btn reopen" data-tooltip="Reopen" onclick="window.reopenTicket('${ticket.id}')">\u21BA</button>
                <button class="action-btn edit" data-tooltip="Edit" onclick="window.openEditTicket('${ticket.id}')">\u270E</button>
                <button class="action-btn delete-action" data-tooltip="Delete" onclick="window.deleteTicket('${ticket.id}')">\uD83D\uDDD1</button>
            </div>`;
        }

        const createdDate = ticket.createdAt?.toDate ? formatDateTime(ticket.createdAt.toDate()) : (ticket.createdAt || '-');
        const statusClass = status.toLowerCase().replace(/\s+/g, '-');

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
            <td><span class="status-badge ${statusClass}">${escapeHTML(status)}</span></td>
            <td>${actionHTML}</td>
        `;
        ticketList.appendChild(row);
    });
}

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

window.resolveTicket = async function(id) {
    if (!confirm('Are you sure you want to resolve this ticket?')) return;
    try {
        await firestoreService.updateTicket(id, { status: 'Resolved' });
        console.log('Ticket resolved successfully');
    } catch (error) {
        console.log('Failed to resolve ticket');
    }
};

window.reopenTicket = async function(id) {
    if (!confirm('Reopen this ticket as In Progress?')) return;
    try {
        await firestoreService.updateTicket(id, { status: 'In Progress' });
        console.log('Ticket reopened as In Progress');
    } catch (error) {
        console.log('Failed to reopen ticket');
    }
};

window.deleteTicket = async function(id) {
    if (!confirm('Are you sure you want to delete this ticket?')) return;
    try {
        await firestoreService.deleteTicket(id);
        console.log('Ticket deleted');
    } catch (error) {
        console.log('Failed to delete ticket');
    }
};

window.openTicketModal = function(id) {
    const ticket = allTickets.find(t => t.id === id);
    if (!ticket) return;

    modalTicketTitle.textContent = `Ticket: ${ticket.ticketNumber || ticket.id}`;
    ticketModalBody.innerHTML = `
        <div class="modal-field"><label>Ticket Number</label><span>${escapeHTML(ticket.ticketNumber || ticket.id)}</span></div>
        <div class="modal-field"><label>Branch</label><span>${escapeHTML(ticket.branch || '-')}</span></div>
        <div class="modal-field"><label>Status</label><span>${escapeHTML(ticket.status || 'Pending')}</span></div>
        <div class="modal-field"><label>Priority</label><span>${escapeHTML(ticket.priority || 'Medium')}</span></div>
        <div class="modal-field"><label>Reporter</label><span>${escapeHTML(ticket.name || '-')}</span></div>
        <div class="modal-field"><label>Position</label><span>${escapeHTML(ticket.position || '-')}</span></div>
        <div class="modal-field"><label>Contact</label><span>${escapeHTML(ticket.contact || '-')}</span></div>
        <div class="modal-field"><label>Email</label><span>${escapeHTML(ticket.email || '-')}</span></div>
        <div class="modal-field"><label>Incident</label><span>${escapeHTML(ticket.incident || '-')}</span></div>
        <div class="modal-field"><label>Location</label><span>${escapeHTML(ticket.location || '-')}</span></div>
        <div class="modal-field"><label>Incident Date</label><span>${escapeHTML(ticket.datetime || '-')}</span></div>
        <div class="modal-field full-width"><label>Created At</label><span>${ticket.createdAt?.toDate ? formatDateTime(ticket.createdAt.toDate()) : (ticket.createdAt || '-')}</span></div>
        <div class="modal-field full-width"><label>Description</label><span>${escapeHTML(ticket.description || 'No description.')}</span></div>
    `;
    ticketModal.classList.add('active');
};

if (closeTicketModal) closeTicketModal.addEventListener('click', () => ticketModal.classList.remove('active'));

window.openEditTicket = function(id) {
    const ticket = allTickets.find(t => t.id === id);
    if (!ticket) return;

    document.getElementById('editTicketId').value = id;
    document.getElementById('editBranch').value = ticket.branch || '';
    document.getElementById('editPriority').value = ticket.priority || 'Medium';
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

    if (!confirm(`Are you sure you want to ${label} ${checked.length} ticket(s)?`)) return;

    try {
        for (const cb of checked) {
            const id = cb.value;
            if (isDelete) { await firestoreService.deleteTicket(id); } 
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
                priority: priority || 'Medium',
                status: 'Pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await firestoreService.setTicket(ticketID, ticketData);
            console.log(`Ticket submitted! No: ${ticketID}`);
            ticketForm.reset();
            switchTab('tickets');
        } catch (error) {
            console.log('Failed to submit ticket.');
        }
    });
}

// ==============================================================
//  PRINTABLE MONTHLY REPORT & NAVIGATION
// ==============================================================

async function generateMonthlyIncidents() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

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

        for (const log of sorted) {
            const d = log.dateTime?.toDate ? log.dateTime.toDate() : new Date(log.dateTime);
            if (log.status === 'Offline' && offlineStart === null) {
                offlineStart = d;
            } else if (log.status === 'Online' && offlineStart !== null) {
                incidentCount++;
                const durationMinutes = getDurationMinutes(offlineStart, d);
                incidents.push({
                    incidentNumber: incidentCount,
                    dateTimeOffline: offlineStart,
                    dateTimeRestored: d,
                    duration: formatDuration(durationMinutes),
                    durationMinutes: durationMinutes
                });
                offlineStart = null;
            }
        }

        if (offlineStart !== null) {
            const branch = branches.find(b => b.branchName === branchName);
            if (branch && branch.currentStatus === 'Offline') {
                incidentCount++;
                const durMinutes = getDurationMinutes(offlineStart, now);
                incidents.push({
                    incidentNumber: incidentCount,
                    dateTimeOffline: offlineStart,
                    dateTimeRestored: null,
                    duration: formatDuration(durMinutes) + ' (ongoing)',
                    durationMinutes: durMinutes
                });
            }
        }

        if (incidents.length > 0) branchIncidents[branchName] = incidents;
    }

    return branchIncidents;
}

async function printMonthlyReport() {
    const now = new Date();
    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const som = new Date(now.getFullYear(), now.getMonth(), 1);
    const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const periodEl = document.getElementById('printReportPeriod');
    const genDateEl = document.getElementById('printGeneratedDate');
    if (periodEl) periodEl.textContent = `${monthName} (${formatDate(som)} \u2014 ${formatDate(eom)})`;
    if (genDateEl) genDateEl.textContent = `${formatDate(now)} at ${formatTime(now)}`;

    const reportBody = document.getElementById('printReportBody');
    if (!reportBody) return;
    
    const branchIncidents = await generateMonthlyIncidents();

    if (Object.keys(branchIncidents).length === 0) {
        reportBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#666;"><em>No incidents recorded for ${monthName}.</em></td></tr>`;
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

            html += `
                <tr>
                    <td class="print-branch-name"><strong>${escapeHTML(branchName)}</strong></td>
                    <td class="print-total-incidents">${totalIncidents}</td>
                    <td class="print-incident-no">${incidentNumbers}</td>
                    <td class="print-offline-time">${offlineTimes}</td>
                    <td class="print-restored-time">${restoredTimes}</td>
                    <td class="print-duration">${durations}</td>
                </tr>
            `;
        }
        reportBody.innerHTML = html;
    }
    window.print();
}

function switchTab(tabId) {
    navItems.forEach(item => { item.classList.toggle('active', item.dataset.tab === tabId); });
    tabContents.forEach(tab => { tab.classList.toggle('active', tab.id === `tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`); });

    const titles = { dashboard: 'Dashboard', branches: 'Branch Monitor', history: 'Status History', tickets: 'Tickets' };
    const subtitles = { dashboard: 'Overview & Analytics', branches: 'Real-time Branch Health Status', history: 'Status Change Logs', tickets: 'Incident Ticket Management' };
    if (pageTitle) pageTitle.textContent = titles[tabId] || 'Dashboard';
    if (pageSubtitle) pageSubtitle.textContent = subtitles[tabId] || '';
}

window.switchTab = switchTab;

if (sidebarToggle) sidebarToggle.addEventListener('click', () => { sidebar.classList.toggle('collapsed'); });

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab(item.dataset.tab);
    });
});

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
    branchListBody.innerHTML = branches.map(b => {
        const sc = b.currentStatus === 'Online' ? 'online' : 'offline';
        return `<tr>
            <td><strong>${escapeHTML(b.branchName)}</strong></td>
            <td><span class="status-badge ${sc}">${escapeHTML(b.currentStatus)}</span></td>
            <td>
                <button class="action-btn delete-action btn-remove-branch" data-branch="${escapeHTML(b.branchName)}" data-tooltip="Remove"><i class="fas fa-trash"></i></button>
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
    initApp();
});

