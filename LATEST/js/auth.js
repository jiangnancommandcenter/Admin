/**
 * Authentication Module
 * Handles login/logout using Firebase Auth
 */

// ==============================================================
// DOM REFERENCES
// ==============================================================

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const messageEl = document.getElementById('message');

// ==============================================================
// LOGIN
// ==============================================================

// Roles are managed in Firebase user documents, not in hardcoded app code.
async function resolveLoginDestination(user) {
    try {
        const email = user && user.email ? user.email : '';
        const profile = await window.getUserProfile(email);
        const data = profile || null;

        if (data && (data.status || '').toLowerCase() === 'pending') return 'pending-approval.html';

        const role = (data && data.role) || 'operator';
        if (role === 'superadmin') return 'main.html';
        if (role === 'owner') return 'ownerdashboard.html';
        return 'main.html';
    } catch (err) {
        console.warn('Role lookup failed, defaulting to main.html:', err && err.message ? err.message : err);
        return 'main.html';
    }
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            if (messageEl) messageEl.textContent = 'Please enter email and password.';
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = 'LOGGING IN...';

        try {
            await auth.signInWithEmailAndPassword(email, password);
            if (messageEl) messageEl.textContent = '';
            // Route to the correct dashboard based on role.
            const destination = await resolveLoginDestination(auth.currentUser);
            window.location.href = destination;
        } catch (error) {
            console.error('Login error:', error);
            if (messageEl) messageEl.textContent = error.message;
            loginBtn.disabled = false;
            loginBtn.textContent = 'LOGIN';
        }
    });
}

// ==============================================================
// AUTH STATE OBSERVER
// ==============================================================

auth.onAuthStateChanged((user) => {
    // On pages that require auth, redirect to login
    const isLoginPage = window.location.pathname.includes('login.html');
    const isPendingPage = window.location.pathname.includes('pending-approval.html');
    const isIndexPage = window.location.pathname.includes('main.html') ||
                        window.location.pathname.endsWith('/Implement/') ||
                        window.location.pathname.endsWith('/Implement') ||
                        window.location.pathname.includes('index.html');

    if (isIndexPage && !user) {
        // Comment out to allow public access to index
        // window.location.href = 'login.html';
    }

    // Route PENDING (not-yet-approved) users away from the dashboard.
    if (isIndexPage && user && !isLoginPage && !isPendingPage && db) {
        const email = user && user.email ? user.email : '';
        db.collection('users').doc(window.normalizeUserEmail(email)).get()
            .then(snap => {
                if (snap.exists && (snap.data().status || '').toLowerCase() === 'pending') {
                    window.location.href = 'pending-approval.html';
                }
            })
            .catch(err => console.warn('Approval status check skipped:', err && err.message ? err.message : err));
    }
});

// ==============================================================
// LOGOUT
// ==============================================================

window.handleLogout = async function() {
    if (!confirm('Are you sure you want to log out?')) return;
    try {
        await auth.signOut();
        showToast('Logged out successfully', 'success');
        // Reload to reset UI
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Failed to log out', 'error');
    }
};

