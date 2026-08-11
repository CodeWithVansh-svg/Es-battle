import {
    ADMINS,
    findAdminByEmail,
    loadUsers,
    saveUsers,
    setCurrentUser,
    saveRememberedLogin,
    clearRememberedLogin,
    loadRememberedLogin,
    getCurrentUser
} from './js/local-db.js';

import {
    isRemoteApiAvailable,
    apiLogin,
    apiRegister,
    setToken,
    apiLogout
} from './js/api-client.js';

async function registerUser(username, email, password, phone, ffUid) {
    // Prefer shared server (Neon via Vercel) so admin sees this account on any device
    try {
        if (await isRemoteApiAvailable()) {
            const data = await apiRegister({ username, email, password, phone, ffUid });
            setCurrentUser({
                username: data.user.username,
                email: data.user.email,
                phone: data.user.phone,
                ffUid: data.user.ff_uid,
                role: data.user.role
            });
            return { success: true, message: 'Account created successfully. You can now log in.', remote: true };
        }
    } catch (error) {
        return { success: false, message: error.message || 'Registration failed on server.' };
    }

    const users = loadUsers();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    const normalizedFfUid = (ffUid || '').trim();

    const emailExists = users.some((user) => user.email === normalizedEmail);
    const usernameExists = users.some((user) => user.username.trim().toLowerCase() === normalizedUsername);
    const phoneExists = users.some((user) => user.phone === normalizedPhone);
    const ffUidExists = users.some((user) => user.ffUid === normalizedFfUid);
    const clashesWithAdmin = ADMINS.some((admin) => admin.email.toLowerCase() === normalizedEmail || admin.username.toLowerCase() === normalizedUsername);

    if (!normalizedPhone) {
        return { success: false, message: 'Phone number is required.' };
    }

    if (!/^[0-9]{6,12}$/.test(normalizedFfUid)) {
        return { success: false, message: 'Enter a valid Free Fire UID (6-12 digits).' };
    }

    if (clashesWithAdmin) {
        return { success: false, message: 'That email or username is reserved and cannot be used.' };
    }

    if (emailExists && usernameExists) {
        return { success: false, message: 'That email and username are already registered.' };
    }

    if (emailExists) {
        return { success: false, message: 'An account with that email already exists.' };
    }

    if (usernameExists) {
        return { success: false, message: 'That Free Fire IGN is already registered.' };
    }

    if (phoneExists) {
        return { success: false, message: 'That phone number is already registered.' };
    }

    if (ffUidExists) {
        return { success: false, message: 'That Free Fire UID is already linked to another account.' };
    }

    users.push({
        id: Date.now(),
        username: username.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        ffUid: normalizedFfUid,
        password,
        coins: 0,
        winCoins: 0,
        totalEarnings: 0,
        matchesPlayed: 0,
        matchesWon: 0,
        upiId: '',
        role: 'user',
        isBanned: false,
        createdAt: new Date().toISOString(),
        participated: false,
        roomName: '',
        roomPassword: '',
        matches: {
            lonewolf: { participated: false, roomName: '', roomPassword: '' },
            cs1v1: { participated: false, roomName: '', roomPassword: '' }
        }
    });

    saveUsers(users);

    setCurrentUser({
        username: username.trim(),
        email: normalizedEmail
    });

    return { success: true, message: 'Account created successfully. You can now log in.' };
}

async function loginUser(email, password) {
    // Shared server first — admin dashboard on phone will see the same users
    try {
        if (await isRemoteApiAvailable()) {
            const data = await apiLogin(email, password);
            setCurrentUser({
                username: data.user.username,
                email: data.user.email,
                phone: data.user.phone,
                ffUid: data.user.ff_uid,
                role: data.user.role
            });
            return { success: true, message: `Welcome back, ${data.user.username}!`, remote: true };
        }
    } catch (error) {
        // If remote is configured but credentials fail, don't silently fall back to local
        if (error.status === 401 || error.status === 403) {
            return { success: false, message: error.message || 'Invalid email or password.' };
        }
        // Network / missing DB → fall through to localStorage
        console.warn('Remote login unavailable, using local mode:', error.message);
    }

    const users = loadUsers();
    const normalizedEmail = email.trim().toLowerCase();

    const admin = findAdminByEmail(normalizedEmail);
    if (admin && password === admin.password) {
        setCurrentUser({
            username: admin.username,
            email: admin.email,
            phone: admin.phone || '',
            ffUid: admin.ffUid || '',
            role: 'admin'
        });

        return { success: true, message: `Welcome back, ${admin.username}!` };
    }

    if (admin) {
        return { success: false, message: 'Invalid email or password.' };
    }

    const user = users.find((entry) => entry.email === normalizedEmail && entry.password === password);

    if (!user) {
        return { success: false, message: 'Invalid email or password.' };
    }

    if (user.isBanned) {
        return { success: false, message: 'This account has been suspended. Contact an admin.' };
    }

    setCurrentUser({
        username: user.username,
        email: user.email
    });

    return { success: true, message: `Welcome back, ${user.username}!` };
}

function resetPassword(email, newPassword, confirmPassword) {
    const users = loadUsers();
    const normalizedEmail = email.trim().toLowerCase();
    const user = users.find((entry) => entry.email === normalizedEmail);

    if (!user) {
        return { success: false, message: 'No account found with that email.' };
    }

    if (newPassword.length < 4) {
        return { success: false, message: 'Password must be at least 4 characters long.' };
    }

    if (newPassword !== confirmPassword) {
        return { success: false, message: 'Passwords do not match.' };
    }

    user.password = newPassword;
    saveUsers(users);

    return { success: true, message: 'Password updated successfully. You can now log in.' };
}

function prefillRememberedLogin() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) {
        return;
    }
    const remembered = loadRememberedLogin();
    if (!remembered) {
        return;
    }
    if (loginForm.email) {
        loginForm.email.value = remembered.email || '';
    }
    if (loginForm.password) {
        loginForm.password.value = remembered.password || '';
    }
    const rememberCheckbox = document.getElementById('remember-me');
    if (rememberCheckbox) {
        rememberCheckbox.checked = true;
    }
}

function showMessage(messageElement, message, type = 'info') {
    if (!messageElement) {
        return;
    }

    messageElement.textContent = message;
    messageElement.className = `message ${type}`;
}

function attachFormHandlers() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const messageBox = document.getElementById('message');

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = loginForm.email.value;
            const password = loginForm.password.value;
            const rememberMe = document.getElementById('remember-me')?.checked || false;
            const result = await loginUser(email, password);
            showMessage(messageBox, result.message, result.success ? 'success' : 'error');

            if (result.success) {
                if (rememberMe) {
                    saveRememberedLogin(email.trim(), password);
                } else {
                    clearRememberedLogin();
                }

                loginForm.reset();
                const normalizedEmail = email.trim().toLowerCase();
                window.location.href = `index.html?user=${encodeURIComponent(normalizedEmail)}`;
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = registerForm.username.value;
            const email = registerForm.email.value;
            const phone = registerForm.phone.value;
            const password = registerForm.password.value;
            const ffUid = registerForm.ffUid.value;
            const result = await registerUser(username, email, password, phone, ffUid);
            showMessage(messageBox, result.message, result.success ? 'success' : 'error');

            if (result.success) {
                registerForm.reset();
                const normalizedEmail = email.trim().toLowerCase();
                window.location.href = `index.html?user=${encodeURIComponent(normalizedEmail)}`;
            }
        });
    }

    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const email = forgotPasswordForm.email.value;
            const newPassword = forgotPasswordForm.newPassword.value;
            const confirmPassword = forgotPasswordForm.confirmPassword.value;
            const result = resetPassword(email, newPassword, confirmPassword);
            showMessage(messageBox, result.message, result.success ? 'success' : 'error');

            if (result.success) {
                forgotPasswordForm.reset();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // If a valid local session already exists, go straight to the app.
    // After logout, local-db clears this value, so the login screen appears normally.
    if (getCurrentUser()) {
        window.location.replace('index.html');
        return;
    }

    attachFormHandlers();
    prefillRememberedLogin();
});
