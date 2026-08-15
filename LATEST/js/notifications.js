// ==============================================================
//  DESKTOP NOTIFICATION SYSTEM
//  Real Windows/Action Center desktop notifications (like YouTube)
//  with notification sound on new tickets.
// ==============================================================

// ===== SOUND =====
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
let notificationAudio = null;

function preloadNotificationSound() {
    try {
        if (!notificationAudio) {
            notificationAudio = new Audio(NOTIFICATION_SOUND_URL);
            notificationAudio.preload = 'auto';
            notificationAudio.load();
        }
    } catch (e) {
        console.warn('[Desktop Notifications] Sound preload failed:', e);
    }
}

function playNotificationSound() {
    try {
        if (!notificationAudio) {
            notificationAudio = new Audio(NOTIFICATION_SOUND_URL);
        }
        notificationAudio.pause();
        notificationAudio.currentTime = 0;
        const p = notificationAudio.play();
        if (p && p.catch) p.catch(() => {});
    } catch (e) {
        console.warn('[Desktop Notifications] Sound play failed:', e);
    }
}

// ===== TRACKING (prevents duplicate notifications) =====
const notifiedDocIds = new Set();

// ===== Store reference to the current window/tab =====
const NOTIFICATION_WINDOW = window;

// ===== PERMISSION =====
let _permissionResolved = false;

/**
 * Request notification permission. Called once on page load.
 * If denied, we show a banner asking user to enable.
 */
async function ensureNotificationPermission() {
    if (_permissionResolved) return Notification.permission;
    _permissionResolved = true;

    if (!('Notification' in window)) {
        console.warn('[Desktop Notifications] Not supported in this browser.');
        return 'unsupported';
    }

    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';

    try {
        const result = await Notification.requestPermission();
        if (result === 'granted') {
            console.log('[Desktop Notifications] Permission granted!');
        } else {
            console.warn('[Desktop Notifications] Permission denied.');
        }
        return result;
    } catch (e) {
        console.error('[Desktop Notifications] Permission error:', e);
        return 'denied';
    }
}

// ===== SHOW DESKTOP NOTIFICATION =====

/**
 * Show a REAL desktop notification (Windows Action Center / macOS / Android).
 * Same as YouTube, Slack, Discord, etc.
 * Returns the Notification object or null on failure.
 */
function showDesktopNotification(ticket) {
    try {
        const ticketId = ticket.id || ticket.ticketNumber || 'unknown';
        const branch = ticket.branch || 'Unknown';
        const subject = ticket.incident || 'N/A';
        const reporter = ticket.name || 'Unknown';

        // Format the time
        let timeStr = '';
        try {
            const d = ticket.createdAt?.toDate ? ticket.createdAt.toDate() : new Date(ticket.createdAt || Date.now());
            timeStr = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        } catch { timeStr = ''; }

        const notification = new Notification('🚨 New CCTV Ticket — Jiangnan Command Center', {
            body: `Branch: ${branch}\nIncident: ${subject}\nReported by: ${reporter}${timeStr ? '\n' + timeStr : ''}`,
            icon: 'https://jiangnanhotpot.com/cdn/shop/files/jiangnan-logo-transparent_40f90d62-6f5e-4f34-9a1a-cf948a106904.png?v=1721972026',
            tag: `ticket-${ticketId}`,
            requireInteraction: true,  // Notification stays until user clicks/dismisses
            silent: true               // We handle sound ourselves
        });

        // Click handler — focus the existing tab and scroll to ticket
        notification.onclick = function (event) {
            event.preventDefault();
            NOTIFICATION_WINDOW.focus();
            // Debounce to avoid Firestore race conditions
            requestAnimationFrame(() => {
                // Switch to Tickets tab using stored reference
                const ticketsTab = NOTIFICATION_WINDOW.document.querySelector('.tab-content#tabTickets');
                if (ticketsTab && !ticketsTab.classList.contains('active')) {
                    // Direct DOM manipulation instead of switchTab to avoid Firestore re-renders
                    NOTIFICATION_WINDOW.document.querySelectorAll('.nav-item').forEach(item => {
                        item.classList.toggle('active', item.dataset.tab === 'tickets');
                    });
                    NOTIFICATION_WINDOW.document.querySelectorAll('.tab-content').forEach(tab => {
                        tab.classList.toggle('active', tab.id === 'tabTickets');
                    });
                    const titles = { dashboard: 'Dashboard', branches: 'Branch Monitor', history: 'Status History', tickets: 'Tickets' };
                    const subtitles = { dashboard: 'Overview & Analytics', branches: 'Real-time Branch Health Status', history: 'Status Change Logs', tickets: 'Incident Ticket Management' };
                    const titleEl = NOTIFICATION_WINDOW.document.getElementById('pageTitle');
                    const subEl = NOTIFICATION_WINDOW.document.getElementById('pageSubtitle');
                    if (titleEl) titleEl.textContent = titles.tickets;
                    if (subEl) subEl.textContent = subtitles.tickets;
                }
                // Scroll to ticket row
                requestAnimationFrame(() => {
                    const row = NOTIFICATION_WINDOW.document.querySelector(`tr[data-ticket-id="${CSS.escape(ticketId)}"]`);
                    if (row) {
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        row.classList.add('ticket-row-highlight');
                        setTimeout(() => row.classList.remove('ticket-row-highlight'), 5000);
                    }
                });
            });
            this.close();
        };

        // Auto-close after 30 seconds (safety)
        setTimeout(() => { try { notification.close(); } catch {} }, 30000);

        return notification;
    } catch (e) {
        console.error('[Desktop Notifications] Failed to show:', e);
        return null;
    }
}

// ===== PERMISSION BANNER =====

/**
 * Show a subtle banner when notification permission is denied,
 * asking the user to enable it in browser settings (like YouTube does).
 */
function showPermissionBanner() {
    if (Notification.permission !== 'denied') return;
    
    // Only show if not already present
    if (document.getElementById('notifPermissionBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'notifPermissionBanner';
    banner.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 9999;
        background: #1e293b; color: #fff; border-radius: 12px;
        padding: 16px 20px; max-width: 340px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        border-left: 4px solid #2563eb;
        font-family: Inter, -apple-system, sans-serif;
        font-size: 13px; line-height: 1.4;
        animation: fadeIn 0.3s ease;
    `;
    banner.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px;">
            <div style="font-size:20px;flex-shrink:0;">🔔</div>
            <div style="flex:1;">
                <div style="font-weight:700;margin-bottom:4px;">Desktop Notifications Disabled</div>
                <div style="color:#94a3b8;font-size:12px;">
                    Enable notifications in your browser settings to receive real-time alerts for new tickets.
                </div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:#64748b;font-size:18px;cursor:pointer;padding:0 4px;">&times;</button>
        </div>
    `;
    document.body.appendChild(banner);
}

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(message, type = 'info', duration = 4000) {
    if (!message) return;
    let container = document.getElementById('toastNotificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastNotificationContainer';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.cssText = `
        background: ${type === 'error' ? '#dc2626' : type === 'success' ? '#15803d' : '#1e293b'};
        color: #ffffff;
        border-radius: 12px;
        padding: 12px 16px;
        box-shadow: 0 16px 40px rgba(15,23,42,0.25);
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.95rem;
        line-height: 1.4;
        opacity: 0;
    `;
    toast.innerHTML = `<span>${escapeHTML(message)}</span>`;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;';
    closeBtn.addEventListener('click', () => {
        toast.style.animation = 'toastSlideOut 0.25s ease forwards';
        setTimeout(() => toast.remove(), 250);
    });
    toast.appendChild(closeBtn);

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.4s ease forwards';
    }, 10);

    setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.25s ease forwards';
        setTimeout(() => toast.remove(), 250);
    }, duration);
}

window.showToast = showToast;

// ===== PUBLIC API =====

/**
 * Handle a new ticket — show desktop notification + play sound.
 * Called from script.js when a new ticket arrives via Firestore.
 */
function notifyNewTicket(ticket) {
    const docId = ticket.id;
    if (!docId || notifiedDocIds.has(docId)) return;
    notifiedDocIds.add(docId);

    // 1. Play notification sound
    playNotificationSound();

    // 2. Show desktop notification if permitted
    if (Notification.permission === 'granted') {
        showDesktopNotification(ticket);
    } else {
        // Show permission banner if denied
        showPermissionBanner();
    }
}

/**
 * Initialize the desktop notification system.
 * Call once on page load.
 */
async function initDesktopNotifications() {
    preloadNotificationSound();
    const perm = await ensureNotificationPermission();

    if (perm === 'granted') {
        console.log('[Desktop Notifications] ✅ Active — you will receive desktop notifications for new tickets.');
    } else if (perm === 'denied') {
        console.log('[Desktop Notifications] ❌ Permission denied. Showing enable banner.');
        setTimeout(showPermissionBanner, 3000);
    } else {
        console.log('[Desktop Notifications] ℹ️ Permission not granted yet.');
    }
}

// ===== EXPOSE GLOBALLY =====
window.initDesktopNotifications = initDesktopNotifications;
window.notifyNewTicket = notifyNewTicket;
