/**
 * Firebase Configuration & Initialization
 * Unified for Branch Monitoring + Ticket System
 * Uses Firebase v8 Compatibility SDK
 */

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD3R9VtLbqPxPlKXn5QBRdyiwPOrGRdDRE",
  authDomain: "jn-data-f29ae.firebaseapp.com",
  projectId: "jn-data-f29ae",
  storageBucket: "jn-data-f29ae.firebasestorage.app",
  messagingSenderId: "1067159087911",
  appId: "1:1067159087911:web:9157cb14590a382a4a1702",
  measurementId: "G-HR7CJLT7H3"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();

// Initialize Auth
const auth = firebase.auth();

// Enable offline persistence (wrapped to avoid INTERNAL ASSERTION FAILED in v8.10.1)
try {
    db.enablePersistence()
        .catch(function(err) {
            if (err.code === 'failed-precondition') {
                console.warn('Firebase persistence failed: Multiple tabs open');
            } else if (err.code === 'unimplemented') {
                console.warn('Firebase persistence not supported in this browser');
            } else {
                console.warn('Firebase persistence error (non-critical):', err);
            }
        });
} catch (e) {
    console.warn('Firebase persistence skipped:', e.message);
}

// ==============================================================
// FIRESTORE UTILITY FUNCTIONS
// ==============================================================

// ==============================================================
// TICKET NUMBER PREFIXES (single source of truth)
// ==============================================================

const BRANCH_CODES = {
    "Banawe": "bnw", "BF Homes": "bf", "Eastwood": "estw",
    "Fame": "fame", "Gil Fernando": "gilf", "Hemady": "hmdy",
    "Holy Spirit": "hspi", "MOA": "moa", "Ortigas Center": "ortc",
    "Paseo": "pseo", "Promenade": "prme", "SM Clark": "smc",
    "SM Fairview": "smf", "SM Marikina": "smmk", "SM Marilao": "smml",
    "SM South Mall": "smsm", "SMDC Wind": "smwd", "SM East Ortigas": "smeo",
    "Sta. Rosa": "str", "SM Sucat": "smsu", "Tagaytay": "tag"
};

/**
 * Map a branch name to its ticket-number prefix. Single source of truth for
 * both the transactional generator and any public submission forms.
 */
function branchToPrefix(branch) {
    if (!branch) return '';
    return BRANCH_CODES[branch] || branch.toLowerCase().substring(0, 3);
}
window.branchToPrefix = branchToPrefix;
window.BRANCH_CODES = BRANCH_CODES;

const firestoreService = {
    // ===== BRANCH MONITORING =====

    /**
     * Get all branches
     */
    async getBranches() {
        const snapshot = await db.collection('branches').get();
        const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        results.sort((a, b) => (a.branchName || '').localeCompare(b.branchName || ''));
        return results;
    },

    /**
     * Update or create a branch document
     */
    async setBranch(branchName, data) {
        const docRef = db.collection('branches').doc(branchName);
        await docRef.set({
            branchName,
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    },

    /**
     * Delete a branch document
     */
    async deleteBranch(branchName) {
        await db.collection('branches').doc(branchName).delete();
    },

    /**
     * Get status logs for a specific branch
     */
    async getBranchLogs(branchName) {
        const snapshot = await db.collection('status_logs')
            .where('branchName', '==', branchName)
            .get();
        const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        results.sort((a, b) => {
            const aTime = a.dateTime?.toDate?.()?.getTime() || 0;
            const bTime = b.dateTime?.toDate?.()?.getTime() || 0;
            return bTime - aTime;
        });
        return results;
    },

    /**
     * Get all status logs
     */
    async getAllLogs() {
        const snapshot = await db.collection('status_logs').get();
        const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        results.sort((a, b) => {
            const aTime = a.dateTime?.toDate?.()?.getTime() || 0;
            const bTime = b.dateTime?.toDate?.()?.getTime() || 0;
            return bTime - aTime;
        });
        return results;
    },

    /**
     * Add a new status log entry
     */
    async addStatusLog(data) {
        const docRef = await db.collection('status_logs').add({
            branchName: data.branchName,
            status: data.status,
            dateTime: firebase.firestore.Timestamp.fromDate(new Date(data.dateTime)),
            remarks: data.remarks || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return docRef.id;
    },

    /**
     * Update an existing status log entry
     */
    async updateStatusLog(logId, data) {
        await db.collection('status_logs').doc(logId).update({
            branchName: data.branchName,
            status: data.status,
            dateTime: firebase.firestore.Timestamp.fromDate(new Date(data.dateTime)),
            remarks: data.remarks || '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    /**
     * Delete a status log entry
     */
    async deleteStatusLog(logId) {
        await db.collection('status_logs').doc(logId).delete();
    },

    /**
     * Get logs for a branch within a date range
     */
    async getBranchLogsInRange(branchName, startDate, endDate) {
        const snapshot = await db.collection('status_logs')
            .where('branchName', '==', branchName)
            .get();
        const startTime = startDate.getTime();
        const endTime = endDate.getTime();

        let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        results = results.filter(log => {
            const logTime = log.dateTime?.toDate?.()?.getTime() || 0;
            return logTime >= startTime && logTime <= endTime;
        });
        results.sort((a, b) => {
            const aTime = a.dateTime?.toDate?.()?.getTime() || 0;
            const bTime = b.dateTime?.toDate?.()?.getTime() || 0;
            return aTime - bTime;
        });
        return results;
    },

    // ===== TICKET SYSTEM =====

    /**
     * Get all tickets ordered by createdAt descending
     */
    async getTickets() {
        const snapshot = await db.collection('tickets').get();
        const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        results.sort((a, b) => {
            const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
            const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
            return bTime - aTime;
        });
        return results;
    },

    /**
     * Add (or set) a ticket document
     */
    async setTicket(ticketId, data) {
        await db.collection('tickets').doc(ticketId).set(data, { merge: true });
    },

    /**
     * Update specific fields of a ticket
     */
    async updateTicket(ticketId, data) {
        await db.collection('tickets').doc(ticketId).update({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    /**
     * Delete a ticket
     */
    async deleteTicket(ticketId) {
        await db.collection('tickets').doc(ticketId).delete();
    },

    /**
     * Listen to real-time ticket updates
     */
    listenTickets(callback, onError = null) {
        return db.collection('tickets').onSnapshot(
            (snapshot) => {
                const tickets = [];
                snapshot.forEach((doc) => {
                    tickets.push({ id: doc.id, ...doc.data() });
                });
                tickets.sort((a, b) => {
                    const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
                    const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
                    return bTime - aTime;
                });
                callback(tickets, snapshot.docChanges());
            },
            (error) => {
                console.error('🔥 Firestore ticket listener error:', error);
                if (onError) onError(error);
            }
        );
    },

    /**
     * Generate the next ticket number for a branch.
     *
     * Uses a Firestore transaction + a per-branch counter document
     * (`counters/tickets-<prefix>`) so concurrent submissions can never
     * receive the same ticket number (the old client-side count was racy).
     *
     * Lazy seeding: the first time a branch's counter is missing, the current
     * highest existing ticket number for that branch is used as the baseline,
     * so ID numbering stays contiguous with legacy tickets.
     */
    async generateTicketNumber(branch) {
        const prefix = branchToPrefix(branch);
        const counterId = 'tickets-' + prefix;
        const counterRef = db.collection('counters').doc(counterId);

        // Only scan existing tickets while this branch has no counter yet.
        let seed = 0;
        try {
            const pre = await counterRef.get();
            if (!pre.exists) {
                const snapshot = await db.collection('tickets').get();
                let maxNum = 0;
                snapshot.forEach((doc) => {
                    const id = doc.id;
                    if (id.indexOf(prefix + '-tix') === 0) {
                        const n = parseInt(id.slice((prefix + '-tix').length), 10);
                        if (!isNaN(n) && n > maxNum) maxNum = n;
                    }
                });
                seed = maxNum;
            }
        } catch (e) {
            console.warn('Ticket counter pre-roll skipped:', e && e.message ? e.message : e);
        }

        let allocated = 0;
        await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(counterRef);
            const current = snap.exists ? (Number(snap.data().count) || 0) : seed;
            allocated = Math.max(current, seed) + 1;
            await transaction.set(counterRef, {
                prefix,
                count: allocated,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });

        return `${prefix}-tix${String(allocated).padStart(3, '0')}`;
    }
};

// Roles are managed in Firestore user documents; hardcoded emails are intentionally not used here.
window.SUPERADMIN_EMAILS = [];

window.normalizeUserEmail = function(value) {
    return String(value || '').trim().toLowerCase();
};

window.getUserProfile = async function(email) {
    const normalized = window.normalizeUserEmail(email);
    if (!normalized) return null;
    try {
        const snap = await db.collection('users').doc(normalized).get();
        if (snap.exists) return { id: snap.id, ...snap.data() };

        const querySnap = await db.collection('users').where('email', '==', normalized).limit(1).get();
        if (!querySnap.empty) {
            const doc = querySnap.docs[0];
            return { id: doc.id, ...doc.data() };
        }

        return null;
    } catch (error) {
        console.warn('Failed to load user profile from Firestore:', error && error.message ? error.message : error);
        return null;
    }
};

// Make firestoreService globally accessible
window.firestoreService = firestoreService;
window.db = db;
window.auth = auth;

