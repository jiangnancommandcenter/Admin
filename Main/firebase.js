/**
 * Firebase Configuration & Initialization
 * Unified for Branch Monitoring + Ticket System
 * Uses Firebase v8 Compatibility SDK
 */

const firebaseConfig = {
    apiKey: "AIzaSyCRiYk14He7Risx17-wMDjoonle-d3fkAs",
    authDomain: "cctv-report-system.firebaseapp.com",
    projectId: "cctv-report-system",
    storageBucket: "cctv-report-system.firebasestorage.app",
    messagingSenderId: "837501661333",
    appId: "1:837501661333:web:141e71e36f392fed14ab9c",
    measurementId: "G-CW8T24ZWVE"
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
     * Generate ticket number
     */
    async generateTicketNumber(branch) {
        const branchCodes = {
            "Banawe": "bnw", "BF Homes": "bf", "Eastwood": "estw",
            "Fame": "fame", "Gil Fernando": "gilf", "Hemady": "hmdy",
            "Holy Spirit": "hspi", "MOA": "moa", "Ortigas Center": "ortc",
            "Paseo": "pseo", "Promenade": "prme", "SM Clark": "smc",
            "SM Fairview": "smf", "SM Marikina": "smmk", "SM Marilao": "smml",
            "SM South Mall": "smsm", "SMDC Wind": "smwd", "SM East Ortigas": "smeo",
            "Sta. Rosa": "str", "SM Sucat": "smsu", "Tagaytay": "tag"
        };

        let prefix = branchCodes[branch] || branch.toLowerCase().substring(0, 3);
        const snapshot = await db.collection('tickets').get();

        let count = 1;
        snapshot.forEach((ticket) => {
            if (ticket.id.startsWith(prefix + "-tix")) {
                count++;
            }
        });

        let number = String(count).padStart(3, "0");
        return `${prefix}-tix${number}`;
    }
};

// Make firestoreService globally accessible
window.firestoreService = firestoreService;
window.db = db;
window.auth = auth;

