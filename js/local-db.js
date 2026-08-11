/* ==========================================================
   LOCAL-DB
   A single localStorage-backed "database" shared by every page.
   Replaces the previous Supabase client (js/supabase.js + js/auth.js),
   which was never wired to the same account data that login.js /
   register.js / tournament.html actually use.
========================================================== */

const USERS_KEY = 'login-users-db';
const CURRENT_USER_KEY = 'logged-in-user';
const REMEMBER_KEY = 'remembered-login';
const RECHARGE_KEY = 'recharge-requests-db';
const WITHDRAW_KEY = 'withdraw-requests-db';
const TRANSACTIONS_KEY = 'wallet-transactions-db';

export const ADMINS = [
    { email: 'dudhevansh8@gmail.com', password: '2345678910$$', username: 'vansh_dada', phone: '8989921991', ffUid: '9571892213' },
    { email: 'samarthkhamele@gmail.com', password: 'samarth333', username: 'Samarth', phone: '', ffUid: '1861297996' }
];

/* ---------------- low-level helpers ---------------- */

function genId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readJSON(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value === null || value === undefined ? fallback : value;
    } catch (error) {
        console.warn(`Unable to read "${key}" from localStorage:`, error);
        return fallback;
    }
}

function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

/* ---------------- users ---------------- */

export function loadUsers() {
    const users = readJSON(USERS_KEY, []);
    return Array.isArray(users) ? users : [];
}

export function saveUsers(users) {
    writeJSON(USERS_KEY, users);
}

export function findAdminByEmail(email) {
    const normalized = (email || '').trim().toLowerCase();
    return ADMINS.find((admin) => admin.email.toLowerCase() === normalized) || null;
}

function findRawUserByEmail(email) {
    return loadUsers().find((user) => user.email === email) || null;
}

function normalizeUser(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone || '',
        ff_uid: user.ffUid || '',
        coins: Number(user.coins) || 0,
        win_coins: Number(user.winCoins) || 0,
        matches_played: Number(user.matchesPlayed) || 0,
        matches_won: Number(user.matchesWon) || 0,
        role: user.role || 'user',
        is_banned: !!user.isBanned,
        created_at: user.createdAt || new Date(Number(user.id) || Date.now()).toISOString()
    };
}

function normalizeAdmin(admin) {
    return {
        id: `admin-${admin.email}`,
        username: admin.username,
        email: admin.email,
        phone: admin.phone || '',
        ff_uid: admin.ffUid || '',
        coins: 0,
        win_coins: 0,
        matches_played: 0,
        matches_won: 0,
        role: 'admin',
        is_banned: false,
        created_at: new Date().toISOString()
    };
}

export function getAllProfiles() {
    return loadUsers().map(normalizeUser);
}

/* ---------------- session ---------------- */

export function getCurrentUser() {
    return readJSON(CURRENT_USER_KEY, null);
}

export function setCurrentUser(session) {
    writeJSON(CURRENT_USER_KEY, session);
}

export function clearCurrentUser() {
    localStorage.removeItem(CURRENT_USER_KEY);
}

export function saveRememberedLogin(email, password) {
    try {
        writeJSON(REMEMBER_KEY, { email, password });
    } catch (error) {
        console.warn('Unable to save remembered login:', error);
    }
}

export function clearRememberedLogin() {
    localStorage.removeItem(REMEMBER_KEY);
}

export function loadRememberedLogin() {
    return readJSON(REMEMBER_KEY, null);
}

/* ---------------- auth ---------------- */

export async function requireAuth() {
    return !!getCurrentUser();
}

export async function logout() {
    clearCurrentUser();
}

export async function loadProfile() {
    const session = getCurrentUser();
    if (!session) return null;

    const admin = findAdminByEmail(session.email);
    if (admin) return normalizeAdmin(admin);

    const user = findRawUserByEmail(session.email);
    if (!user) return null;

    return normalizeUser(user);
}

/* ---------------- wallet ---------------- */

export function getWallet(email) {
    const user = findRawUserByEmail(email);
    if (!user) return null;
    return { coins: Number(user.coins) || 0, win_coins: Number(user.winCoins) || 0 };
}

export function updateUserWallet(email, { coinsDelta = 0, winCoinsDelta = 0 } = {}) {
    const users = loadUsers();
    const user = users.find((entry) => entry.email === email);
    if (!user) return null;

    user.coins = (Number(user.coins) || 0) + coinsDelta;
    user.winCoins = (Number(user.winCoins) || 0) + winCoinsDelta;
    saveUsers(users);
    return normalizeUser(user);
}

/* ---------------- transactions ---------------- */

export function addTransaction(email, { type, wallet, amount, note = '' }) {
    const list = readJSON(TRANSACTIONS_KEY, []);
    list.unshift({
        id: genId(),
        user_email: email,
        transaction_type: type,
        wallet,
        amount,
        note,
        created_at: new Date().toISOString()
    });
    writeJSON(TRANSACTIONS_KEY, list);
}

export function getTransactions(email) {
    return readJSON(TRANSACTIONS_KEY, [])
        .filter((tx) => tx.user_email === email)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/* ---------------- recharge requests ---------------- */

export function createRechargeRequest(email, amount, utrNumber, screenshotUrl = '') {
    const list = readJSON(RECHARGE_KEY, []);
    const request = {
        id: genId(),
        user_email: email,
        amount,
        utr_number: utrNumber,
        screenshot_url: screenshotUrl,
        status: 'pending',
        created_at: new Date().toISOString()
    };
    list.unshift(request);
    writeJSON(RECHARGE_KEY, list);
    return request;
}

export function getRechargeRequests(email) {
    return readJSON(RECHARGE_KEY, [])
        .filter((request) => request.user_email === email)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function getPendingRecharges() {
    return readJSON(RECHARGE_KEY, [])
        .filter((request) => request.status === 'pending')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function approveRechargeRequest(id) {
    const list = readJSON(RECHARGE_KEY, []);
    const request = list.find((entry) => entry.id === id);

    if (!request) throw new Error('Request not found.');
    if (request.status !== 'pending') throw new Error('This request has already been processed.');

    request.status = 'approved';
    writeJSON(RECHARGE_KEY, list);

    updateUserWallet(request.user_email, { coinsDelta: Number(request.amount) });
    addTransaction(request.user_email, {
        type: 'recharge',
        wallet: 'coins',
        amount: Number(request.amount),
        note: `Recharge approved (UTR ${request.utr_number})`
    });
}

export function rejectRechargeRequest(id, reason) {
    const list = readJSON(RECHARGE_KEY, []);
    const request = list.find((entry) => entry.id === id);

    if (!request) throw new Error('Request not found.');
    if (request.status !== 'pending') throw new Error('This request has already been processed.');

    request.status = 'rejected';
    request.reason = reason || null;
    writeJSON(RECHARGE_KEY, list);
}

/* ---------------- withdraw requests ---------------- */

export function createWithdrawRequest(email, amount, upiId) {
    const users = loadUsers();
    const user = users.find((entry) => entry.email === email);
    if (!user) throw new Error('Account not found.');

    const winCoins = Number(user.winCoins) || 0;
    if (amount > winCoins) {
        throw new Error("You don't have enough win coins for this withdrawal.");
    }

    const hour = new Date().getHours();
    if (hour < 14 || hour >= 21) {
        throw new Error('Withdrawals are only allowed between 2:00 PM and 9:00 PM.');
    }

    const inMatch =
        user.participated ||
        (user.matches && Object.values(user.matches).some((match) => match && match.participated));

    if (inMatch) {
        throw new Error("You can't withdraw while you're currently in a match.");
    }

    // Coins are deducted immediately, same as before.
    user.winCoins = winCoins - amount;
    saveUsers(users);

    const list = readJSON(WITHDRAW_KEY, []);
    const request = {
        id: genId(),
        user_email: email,
        amount,
        upi_id: upiId,
        status: 'pending',
        created_at: new Date().toISOString()
    };
    list.unshift(request);
    writeJSON(WITHDRAW_KEY, list);

    addTransaction(email, {
        type: 'withdraw',
        wallet: 'win_coins',
        amount: -amount,
        note: 'Withdrawal requested'
    });

    return request;
}

export function getWithdrawRequests(email) {
    return readJSON(WITHDRAW_KEY, [])
        .filter((request) => request.user_email === email)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function getPendingWithdraws() {
    return readJSON(WITHDRAW_KEY, [])
        .filter((request) => request.status === 'pending')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function approveWithdrawRequest(id) {
    const list = readJSON(WITHDRAW_KEY, []);
    const request = list.find((entry) => entry.id === id);

    if (!request) throw new Error('Request not found.');
    if (request.status !== 'pending') throw new Error('This request has already been processed.');

    request.status = 'paid';
    writeJSON(WITHDRAW_KEY, list);
}

export function rejectWithdrawRequest(id, reason) {
    const list = readJSON(WITHDRAW_KEY, []);
    const request = list.find((entry) => entry.id === id);

    if (!request) throw new Error('Request not found.');
    if (request.status !== 'pending') throw new Error('This request has already been processed.');

    request.status = 'rejected';
    request.reason = reason || null;
    writeJSON(WITHDRAW_KEY, list);

    // Refund the win coins that were deducted at request time.
    updateUserWallet(request.user_email, { winCoinsDelta: Number(request.amount) });
    addTransaction(request.user_email, {
        type: 'refund',
        wallet: 'win_coins',
        amount: Number(request.amount),
        note: `Withdrawal rejected${reason ? `: ${reason}` : ''}`
    });
}

/* ---------------- leaderboard ---------------- */

export function getLeaderboard(limit = 10) {
    return loadUsers()
        .map((user) => ({
            username: user.username,
            winCoins: Number(user.winCoins) || 0,
            coins: Number(user.coins) || 0,
            matchesPlayed: Number(user.matchesPlayed) || 0,
            matchesWon: Number(user.matchesWon) || 0
        }))
        .sort((a, b) => (b.winCoins - a.winCoins) || (b.matchesWon - a.matchesWon))
        .slice(0, limit);
}


/* ---------------- custom rooms ---------------- */
const ROOMS_KEY = "es-battle-rooms";

export function getRooms() {
    return readJSON(ROOMS_KEY, []);
}

export function createRoom({ name, password, description }) {
    const room = {
        id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: String(name || "").trim(),
        password: String(password || ""),
        description: String(description || "").trim(),
        createdAt: new Date().toISOString(),
        createdBy: getCurrentUser()?.email || "admin"
    };
    if (!room.name) throw new Error("Room name is required.");
    if (!room.password) throw new Error("Room password is required.");
    const rooms = getRooms();
    rooms.unshift(room);
    writeJSON(ROOMS_KEY, rooms);
    return room;
}

export function deleteRoom(roomId) {
    const rooms = getRooms().filter(room => room.id !== roomId);
    writeJSON(ROOMS_KEY, rooms);
    return rooms;
}
