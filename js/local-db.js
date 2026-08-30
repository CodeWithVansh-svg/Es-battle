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

// Admin accounts used to be hardcoded here with real plaintext passwords,
// shipped to every visitor's browser (view-source was enough to read them).
// There is no way to make client-side JS keep a secret, so this file no
// longer has any notion of "local admin" credentials at all — admin actions
// (declaring winners, approving payouts, etc.) require the real server
// (DATABASE_URL configured) where bcrypt-hashed passwords are checked
// server-side. Local/offline mode is a device-only demo for regular users.
export function findAdminByEmail() {
    return null;
}

/* ---------------- low-level helpers ---------------- */

function genId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Best-effort password hashing for the local/offline fallback store. This is
// NOT a substitute for real server-side bcrypt hashing (SubtleCrypto SHA-256
// is fast to brute-force compared to bcrypt) — it exists only so a stolen
// browser profile or a `localStorage` dump doesn't hand over plaintext
// passwords. Real accounts should always go through the server API.
const LOCAL_HASH_SALT = 'es-battle-local-v1';

export async function hashLocalPassword(password) {
    const data = new TextEncoder().encode(`${LOCAL_HASH_SALT}:${password}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyLocalPassword(password, storedHash) {
    if (!storedHash) return false;
    const hash = await hashLocalPassword(password);
    return hash === storedHash;
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
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn(`Unable to write "${key}" to localStorage:`, error);
    }
}

/* ---------------- users ---------------- */

export function loadUsers() {
    const users = readJSON(USERS_KEY, []);
    return Array.isArray(users) ? users : [];
}

export function saveUsers(users) {
    writeJSON(USERS_KEY, users);
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

export function saveRememberedLogin(email) {
    try {
        writeJSON(REMEMBER_KEY, { email });
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

    const user = findRawUserByEmail(session.email);
    if (!user) return null;

    return normalizeUser(user);
}

/* ---------------- wallet ---------------- */

export function getWallet(email) {
    const user = findRawUserByEmail(email);
    if (!user) return null;

    return {
        coins: Number(user.coins) || 0,
        win_coins: Number(user.winCoins) || 0
    };
}

export function updateUserWallet(
    email,
    { coinsDelta = 0, winCoinsDelta = 0 } = {}
) {
    const users = loadUsers();
    const user = users.find(
        (entry) => entry.email === email
    );

    if (!user) return null;

    user.coins =
        (Number(user.coins) || 0) +
        coinsDelta;

    user.winCoins =
        (Number(user.winCoins) || 0) +
        winCoinsDelta;

    saveUsers(users);

    return normalizeUser(user);
}

/* ---------------- transactions ---------------- */

export function addTransaction(
    email,
    { type, wallet, amount, note = '' }
) {
    const list = readJSON(
        TRANSACTIONS_KEY,
        []
    );

    list.unshift({
        id: genId(),
        user_email: email,
        transaction_type: type,
        wallet,
        amount,
        note,
        created_at:
            new Date().toISOString()
    });

    writeJSON(
        TRANSACTIONS_KEY,
        list
    );
}

export function getTransactions(email) {
    return readJSON(
        TRANSACTIONS_KEY,
        []
    )
        .filter(
            (tx) =>
                tx.user_email === email
        )
        .sort(
            (a, b) =>
                new Date(b.created_at) -
                new Date(a.created_at)
        );
}

/* ---------------- recharge requests ---------------- */

export function createRechargeRequest(
    email,
    amount,
    utrNumber,
    screenshotUrl = ''
) {
    const list = readJSON(
        RECHARGE_KEY,
        []
    );

    const request = {
        id: genId(),
        user_email: email,
        amount,
        utr_number: utrNumber,
        screenshot_url:
            screenshotUrl,
        status: 'pending',
        created_at:
            new Date().toISOString()
    };

    list.unshift(request);

    writeJSON(
        RECHARGE_KEY,
        list
    );

    return request;
}

export function getRechargeRequests(email) {
    return readJSON(
        RECHARGE_KEY,
        []
    )
        .filter(
            (request) =>
                request.user_email === email
        )
        .sort(
            (a, b) =>
                new Date(b.created_at) -
                new Date(a.created_at)
        );
}

export function getPendingRecharges() {
    return readJSON(
        RECHARGE_KEY,
        []
    )
        .filter(
            (request) =>
                request.status === 'pending'
        )
        .sort(
            (a, b) =>
                new Date(b.created_at) -
                new Date(a.created_at)
        );
}

export function approveRechargeRequest(id) {
    const list = readJSON(
        RECHARGE_KEY,
        []
    );

    const request = list.find(
        (entry) => entry.id === id
    );

    if (!request) {
        throw new Error(
            'Request not found.'
        );
    }

    if (request.status !== 'pending') {
        throw new Error(
            'This request has already been processed.'
        );
    }

    request.status = 'approved';

    writeJSON(
        RECHARGE_KEY,
        list
    );

    updateUserWallet(
        request.user_email,
        {
            coinsDelta:
                Number(request.amount)
        }
    );

    addTransaction(
        request.user_email,
        {
            type: 'recharge',
            wallet: 'coins',
            amount:
                Number(request.amount),
            note:
                `Recharge approved (UTR ${request.utr_number})`
        }
    );
}

export function rejectRechargeRequest(
    id,
    reason
) {
    const list = readJSON(
        RECHARGE_KEY,
        []
    );

    const request = list.find(
        (entry) => entry.id === id
    );

    if (!request) {
        throw new Error(
            'Request not found.'
        );
    }

    if (request.status !== 'pending') {
        throw new Error(
            'This request has already been processed.'
        );
    }

    request.status = 'rejected';
    request.reason =
        reason || null;

    writeJSON(
        RECHARGE_KEY,
        list
    );
}

/* ---------------- withdraw requests ---------------- */

function currentHourIST() {
    const hourStr =
        new Intl.DateTimeFormat(
            'en-US',
            {
                hour: 'numeric',
                hour12: false,
                timeZone:
                    'Asia/Kolkata'
            }
        ).format(new Date());

    return Number(hourStr) % 24;
}

export function createWithdrawRequest(
    email,
    amount,
    upiId
) {
    const users = loadUsers();

    const user = users.find(
        (entry) =>
            entry.email === email
    );

    if (!user) {
        throw new Error(
            'Account not found.'
        );
    }

    const winCoins =
        Number(user.winCoins) || 0;

    if (amount > winCoins) {
        throw new Error(
            "You don't have enough win coins for this withdrawal."
        );
    }

    const hour =
        currentHourIST();

    if (hour < 14 || hour >= 21) {
        throw new Error(
            'Withdrawals are only allowed between 2:00 PM and 9:00 PM IST.'
        );
    }

    const inMatch =
        user.participated ||
        (
            user.matches &&
            Object.values(
                user.matches
            ).some(
                (match) =>
                    match &&
                    match.participated
            )
        );

    if (inMatch) {
        throw new Error(
            "You can't withdraw while you're currently in a match."
        );
    }

    user.winCoins =
        winCoins - amount;

    saveUsers(users);

    const list = readJSON(
        WITHDRAW_KEY,
        []
    );

    const request = {
        id: genId(),
        user_email: email,
        amount,
        upi_id: upiId,
        status: 'pending',
        created_at:
            new Date().toISOString()
    };

    list.unshift(request);

    writeJSON(
        WITHDRAW_KEY,
        list
    );

    addTransaction(
        email,
        {
            type: 'withdraw',
            wallet: 'win_coins',
            amount: -amount,
            note:
                'Withdrawal requested'
        }
    );

    return request;
}

export function getWithdrawRequests(
    email
) {
    return readJSON(
        WITHDRAW_KEY,
        []
    )
        .filter(
            (request) =>
                request.user_email === email
        )
        .sort(
            (a, b) =>
                new Date(b.created_at) -
                new Date(a.created_at)
        );
}

export function getPendingWithdraws() {
    return readJSON(
        WITHDRAW_KEY,
        []
    )
        .filter(
            (request) =>
                request.status === 'pending'
        )
        .sort(
            (a, b) =>
                new Date(b.created_at) -
                new Date(a.created_at)
        );
}

export function approveWithdrawRequest(
    id
) {
    const list = readJSON(
        WITHDRAW_KEY,
        []
    );

    const request = list.find(
        (entry) => entry.id === id
    );

    if (!request) {
        throw new Error(
            'Request not found.'
        );
    }

    if (request.status !== 'pending') {
        throw new Error(
            'This request has already been processed.'
        );
    }

    request.status = 'paid';

    writeJSON(
        WITHDRAW_KEY,
        list
    );
}

export function rejectWithdrawRequest(
    id,
    reason
) {
    const list = readJSON(
        WITHDRAW_KEY,
        []
    );

    const request = list.find(
        (entry) => entry.id === id
    );

    if (!request) {
        throw new Error(
            'Request not found.'
        );
    }

    if (request.status !== 'pending') {
        throw new Error(
            'This request has already been processed.'
        );
    }

    request.status = 'rejected';
    request.reason =
        reason || null;

    writeJSON(
        WITHDRAW_KEY,
        list
    );

    updateUserWallet(
        request.user_email,
        {
            winCoinsDelta:
                Number(request.amount)
        }
    );

    addTransaction(
        request.user_email,
        {
            type: 'refund',
            wallet: 'win_coins',
            amount:
                Number(request.amount),
            note:
                `Withdrawal rejected${
                    reason
                        ? `: ${reason}`
                        : ''
                }`
        }
    );
}

/* ---------------- leaderboard ---------------- */

export function getLeaderboard(
    limit = 10
) {
    return loadUsers()
        .map((user) => ({
            username:
                user.username,

            winCoins:
                Number(
                    user.winCoins
                ) || 0,

            coins:
                Number(
                    user.coins
                ) || 0,

            matchesPlayed:
                Number(
                    user.matchesPlayed
                ) || 0,

            matchesWon:
                Number(
                    user.matchesWon
                ) || 0
        }))
        .sort(
            (a, b) =>
                (
                    b.winCoins -
                    a.winCoins
                ) ||
                (
                    b.matchesWon -
                    a.matchesWon
                )
        )
        .slice(0, limit);
}

/* ---------------- custom rooms ---------------- */

const ROOMS_KEY =
    "es-battle-rooms";

export function getRooms() {
    return readJSON(
        ROOMS_KEY,
        []
    );
}

export function createRoom({
    name,
    password,
    description
}) {
    const room = {
        id:
            `room_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,

        name:
            String(
                name || ""
            ).trim(),

        password:
            String(
                password || ""
            ),

        description:
            String(
                description || ""
            ).trim(),

        createdAt:
            new Date().toISOString(),

        createdBy:
            getCurrentUser()?.email ||
            "admin"
    };

    if (!room.name) {
        throw new Error(
            "Room name is required."
        );
    }

    if (!room.password) {
        throw new Error(
            "Room password is required."
        );
    }

    const rooms =
        getRooms();

    rooms.unshift(room);

    writeJSON(
        ROOMS_KEY,
        rooms
    );

    return room;
}

export function deleteRoom(
    roomId
) {
    const rooms =
        getRooms().filter(
            (room) =>
                room.id !== roomId
        );

    writeJSON(
        ROOMS_KEY,
        rooms
    );

    return rooms;
}
