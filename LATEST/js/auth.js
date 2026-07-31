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
            window.location.href = 'main.html';
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
    const isIndexPage = window.location.pathname.includes('main.html') ||
                        window.location.pathname.endsWith('/Implement/') ||
                        window.location.pathname.endsWith('/Implement') ||
                        window.location.pathname.includes('index.html');

    if (isIndexPage && !user) {
        // Comment out to allow public access to index
        // window.location.href = 'login.html';
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

