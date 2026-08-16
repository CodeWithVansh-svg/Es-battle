import {
    requireAuth,
    loadProfile,
    logout,
    getWallet,
    getTransactions,
    createRechargeRequest,
    getRechargeRequests,
    createWithdrawRequest,
    getWithdrawRequests,
    getAllProfiles,
    getPendingRecharges,
    getPendingWithdraws,
    approveRechargeRequest,
    rejectRechargeRequest,
    approveWithdrawRequest,
    rejectWithdrawRequest,
    createRoom
} from "./js/local-db.js";

import { showToast as pushToast } from "./js/toast.js";

import {
    isRemoteApiAvailable,
    apiAdminUsers,
    apiAdminRecharges,
    apiAdminWithdraws,
    apiPatchRecharge,
    apiPatchWithdraw,
    apiCreateRecharge,
    apiCreateWithdraw,
    apiSaveRoom,
    apiResetRoom,
    apiGetRoom,
    apiMe,
    getToken,
    setToken,
    apiLogout
} from "./js/api-client.js";


/* ==========================================================
                        GLOBAL STATE
========================================================== */

let currentProfile = null;
let remoteMode = false;

let walletBalance = 0;
let winCoins = 0;

let rechargeRequests = [];
let withdrawRequests = [];
let walletTransactions = [];

let users = [];
let pendingRecharges = [];
let pendingWithdraws = [];

const ui = {};

/* ==========================================================
                        CACHE DOM
========================================================== */

function cacheDom() {

    ui.userPanel =
        document.getElementById("user-panel");

    ui.adminPanel =
        document.getElementById("admin-panel");

    ui.username =
        document.getElementById("username");

    ui.email =
        document.getElementById("email");

    ui.wallet =
        document.getElementById("wallet");

    ui.winWallet =
        document.getElementById("win-wallet");

    ui.logoutButton =
        document.getElementById("logout-button");

}


/* ==========================================================
                    ANIMATED COUNTERS
========================================================== */

function animateNumber(el, toValue) {

    if (!el) return;

    const fromValue =
        Number(el.textContent.replace(/[^\d.-]/g, "")) || 0;

    if (fromValue === toValue) {
        el.textContent = toValue;
        return;
    }

    el.classList.add("hud-counter");

    const duration = 600;
    const startTime = performance.now();

    function tick(now) {

        const progress =
            Math.min((now - startTime) / duration, 1);

        // ease-out cubic
        const eased =
            1 - Math.pow(1 - progress, 3);

        const current =
            Math.round(
                fromValue + (toValue - fromValue) * eased
            );

        el.textContent = current;

        if (progress < 1) {
            requestAnimationFrame(tick);
        }

    }

    requestAnimationFrame(tick);

}

/* ==========================================================
                        TOAST
========================================================== */

function showToast(message, type = "info") {

    console.log(`[${type}] ${message}`);

    pushToast(message, type);

}

/* ==========================================================
                    AUTH CHECK
========================================================== */

async function checkAuthentication() {

    const hasToken =
        !!getToken();

    const hasLocalSession =
        await requireAuth();

    if (!hasToken && !hasLocalSession) {

        window.location.href =
            "login.html";

        return false;

    }

    return true;

}

/* ==========================================================
                    LOAD PROFILE
========================================================== */

async function loadCurrentProfile() {

    const token =
        getToken();

    if (token) {

        // A token means this account lives on the shared server (Neon) —
        // not in localStorage. The old code only ever checked local-db here,
        // so a freshly-registered remote account had no local profile to find
        // and bounced straight back to login.html, which then bounced back
        // to index.html because the session token was still set — an
        // infinite redirect loop with a blank page in between.
        try {

            const data =
                await apiMe();

            currentProfile =
                data.user;

            remoteMode = true;

        } catch (error) {

            if (error.status === 401 || error.status === 403 || error.status === 404) {

                // Token expired/invalid, or the account was banned/removed —
                // clear everything and force a clean re-login instead of looping.
                apiLogout();

                await logout();

                window.location.href =
                    "login.html";

                return;

            }

            // Server unreachable for some other reason (offline, cold start, etc.)
            // — fall back to whatever local profile we might have.
            console.warn(
                "Could not reach server for profile, falling back to local:",
                error.message
            );

            currentProfile =
                await loadProfile();

        }

    } else {

        currentProfile =
            await loadProfile();

    }

    if (!currentProfile) {

        window.location.href =
            "login.html";

        return;

    }

    walletBalance =
        Number(currentProfile.coins) || 0;

    winCoins =
        Number(currentProfile.win_coins) || 0;

    updateProfileUI();

}

/* ==========================================================
                    UPDATE PROFILE UI
========================================================== */

function updateProfileUI() {

    if (!currentProfile)
        return;

    if (ui.username)
        ui.username.textContent =
            currentProfile.username || "";

    if (ui.email)
        ui.email.textContent =
            currentProfile.email || "";

    if (ui.wallet)
        animateNumber(ui.wallet, walletBalance);

    if (ui.winWallet)
        animateNumber(ui.winWallet, winCoins);

}

/* ==========================================================
                    PANEL CONTROL
========================================================== */

function showUserPanel() {

    ui.userPanel?.classList.remove("hidden");

    ui.adminPanel?.classList.add("hidden");

}

function showAdminPanel() {

    const admin = ui.adminPanel || document.getElementById("admin-panel");
    const user = ui.userPanel || document.getElementById("user-panel");

    if (admin) {
        admin.classList.remove("hidden");
        admin.style.display = "block";
    }
    if (user) {
        user.classList.add("hidden");
        user.style.display = "none";
    }

}

/* ==========================================================
                    ROLE CHECK
========================================================== */

function isAdmin() {
    return currentProfile?.role === "admin" ||
        !!(currentProfile?.email && findAdminEmail(currentProfile.email));
}

function findAdminEmail(email) {
    const adminEmails = [
        "dudhevansh8@gmail.com",
        "samarthkhamele@gmail.com"
    ];
    return adminEmails.includes(String(email || "").trim().toLowerCase());
}

/* ==========================================================
                    WALLET
========================================================== */

async function loadWallet() {

    if (!currentProfile) return;

    const wallet = getWallet(currentProfile.email);

    if (!wallet) {

        console.error("Wallet Error: profile not found");

        return;

    }

    walletBalance =
        Number(wallet.coins) || 0;

    winCoins =
        Number(wallet.win_coins) || 0;

    updateWalletUI();

}

function updateWalletUI() {

    if (ui.wallet)
        animateNumber(ui.wallet, walletBalance);

    if (ui.winWallet)
        animateNumber(ui.winWallet, winCoins);

}

/* ==========================================================
                WALLET TRANSACTIONS
========================================================== */

async function loadTransactions() {

    if (!currentProfile)
        return;

    walletTransactions =
        getTransactions(currentProfile.email);

    renderTransactions();

}

function renderTransactions() {

    const container =
        document.getElementById(
            "transaction-list"
        );

    if (!container)
        return;

    container.innerHTML = "";

    if (
        walletTransactions.length === 0
    ) {

        container.innerHTML =
            "<p>No Transactions Found</p>";

        return;

    }

    walletTransactions.forEach(tx => {

        const div =
            document.createElement("div");

        div.className =
            "transaction-item";

        div.innerHTML = `

            <div class="transaction-type">
                ${tx.transaction_type}
            </div>

            <div class="transaction-wallet">
                ${tx.wallet}
            </div>

            <div class="transaction-amount">
                ${tx.amount}
            </div>

            <div class="transaction-note">
                ${tx.note || ""}
            </div>

            <div class="transaction-date">
                ${new Date(
                    tx.created_at
                ).toLocaleString()}
            </div>

        `;

        container.appendChild(div);

    });

}

/* ==========================================================
            REFRESH WALLET
========================================================== */

async function refreshWallet() {

    await loadWallet();

    await loadTransactions();

}

/* ==========================================================
                RECHARGE REQUEST
========================================================== */

async function submitRecharge(
    amount,
    utrNumber,
    screenshotUrl = ""
) {

    if (!currentProfile)
        return false;

    const numericAmount =
        Number(amount);

    if (!numericAmount || numericAmount < 10) {

        showToast(
            "Minimum recharge is 10 coins",
            "error"
        );

        return false;

    }

    try {
        if (remoteMode) {
            await apiCreateRecharge(numericAmount, utrNumber);
        } else {
            createRechargeRequest(
                currentProfile.email,
                numericAmount,
                utrNumber,
                screenshotUrl
            );
        }
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
        return false;
    }

    showToast(
        "Recharge request submitted.",
        "success"
    );

    return true;

}

/* ==========================================================
                WITHDRAW REQUEST
========================================================== */

async function submitWithdraw(
    amount,
    upiId
) {

    if (!currentProfile)
        return false;

    const numericAmount =
        Number(amount);

    if (!numericAmount || numericAmount < 30) {

        showToast(
            "Minimum withdrawal is 30 coins",
            "error"
        );

        return false;

    }

    // Only WIN coins are withdrawable — not the full wallet balance.
    if (numericAmount > winCoins) {

        showToast(
            "You don't have enough win coins for this withdrawal",
            "error"
        );

        return false;

    }

    // Deduction, time-window check (2 PM - 9 PM), and the
    // "not currently in a match" rule are all enforced inside
    // createWithdrawRequest — never trust the client alone for money.
    try {
        if (remoteMode) {
            await apiCreateWithdraw(numericAmount, upiId);
        } else {
            createWithdrawRequest(
                currentProfile.email,
                numericAmount,
                upiId
            );
        }
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
        return false;
    }

    showToast(
        "Withdrawal requested. Coins deducted — it will reach your bank account in 4-5 hours.",
        "success"
    );

    await refreshWallet();

    return true;

}

/* ==========================================================
            BUTTON EVENTS
========================================================== */

function bindRechargeButton() {

    const form =
        document.getElementById(
            "recharge-form"
        );

    if (!form)
        return;

    form.addEventListener(
        "submit",
        async function (e) {

            e.preventDefault();

            const amount =
                form.amount.value;

            const utr =
                form.utr.value;

            const success =
                await submitRecharge(

                    amount,

                    utr

                );

            if (success) {

                form.reset();

                await loadRechargeRequests();

            }

        }

    );

}

function bindWithdrawButton() {

    const form =
        document.getElementById(
            "withdraw-form"
        );

    if (!form)
        return;

    form.addEventListener(
        "submit",
        async function (e) {

            e.preventDefault();

            const amount =
                form.amount.value;

            const upi =
                form.upi.value;

            const success =
                await submitWithdraw(

                    amount,

                    upi

                );

            if (success) {

                form.reset();

                await loadWithdrawRequests();

            }

        }

    );

}

/* ==========================================================
                RECHARGE HISTORY
========================================================== */

async function loadRechargeRequests() {

    if (!currentProfile)
        return;

    rechargeRequests =
        getRechargeRequests(currentProfile.email);

    renderRechargeHistory();

}

function renderRechargeHistory() {

    const container =
        document.getElementById(
            "recharge-history"
        );

    if (!container)
        return;

    container.innerHTML = "";

    if (rechargeRequests.length === 0) {

        container.innerHTML =
            "<p>No Recharge Requests</p>";

        return;

    }

    rechargeRequests.forEach(request => {

        const div =
            document.createElement("div");

        div.className =
            "history-card";

        div.innerHTML = `

            <h4>₹${request.amount}</h4>

            <p>UTR :
            ${request.utr_number}</p>

            <p>Status :
            ${request.status}</p>

            <small>
            ${new Date(
                request.created_at
            ).toLocaleString()}
            </small>

        `;

        container.appendChild(div);

    });

}

/* ==========================================================
                WITHDRAW HISTORY
========================================================== */

async function loadWithdrawRequests() {

    if (!currentProfile)
        return;

    withdrawRequests =
        getWithdrawRequests(currentProfile.email);

    renderWithdrawHistory();

}

function renderWithdrawHistory() {

    const container =
        document.getElementById(
            "withdraw-history"
        );

    if (!container)
        return;

    container.innerHTML = "";

    if (withdrawRequests.length === 0) {

        container.innerHTML =
            "<p>No Withdraw Requests</p>";

        return;

    }

    withdrawRequests.forEach(request => {

        const div =
            document.createElement("div");

        div.className =
            "history-card";

        div.innerHTML = `

            <h4>₹${request.amount}</h4>

            <p>
            ${request.upi_id}
            </p>

            <p>
            ${request.status}
            </p>

            <small>
            ${new Date(
                request.created_at
            ).toLocaleString()}
            </small>

        `;

        container.appendChild(div);

    });

}

/* ==========================================================
                REFRESH REQUESTS
========================================================== */

async function refreshRequests() {

    await loadRechargeRequests();

    await loadWithdrawRequests();

}

/* ==========================================================
                    LOAD ALL USERS
========================================================== */

async function loadUsers() {
    if (remoteMode) {
        try {
            const data = await apiAdminUsers();
            users = (data.users || []).map((u) => ({
                id: u.id,
                username: u.username,
                email: u.email,
                phone: u.phone || "",
                ff_uid: u.ff_uid || "",
                coins: Number(u.coins) || 0,
                win_coins: Number(u.win_coins) || 0,
                role: u.role || "user",
                is_banned: !!u.is_banned,
                matches_played: Number(u.matches_played) || 0,
                matches_won: Number(u.matches_won) || 0,
                created_at: u.created_at
            }));
            renderUsers();
            return;
        } catch (error) {
            showToast(error.message || "Could not load users from server.", "error");
        }
    }

    users =
        getAllProfiles()
            .sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
            );

    renderUsers();

}

/* ==========================================================
                    RENDER USERS
========================================================== */

function renderUsers() {

    const container =
        document.getElementById(
            "admin-users"
        );

    if (!container)
        return;

    container.innerHTML = "";

    if (!users || users.length === 0) {
        container.innerHTML = `
            <div class="admin-empty sm:col-span-2">
                <strong>No registered accounts on this device yet.</strong><br>
                Accounts are stored in this browser only. If users registered on another phone or computer, they will not appear here.
            </div>`;
        return;
    }

    users.forEach(user => {

        const div =
            document.createElement("div");

        div.className =
            "admin-user-card";

        div.innerHTML = `

            <h3>${escapeHtml(user.username)}${user.is_banned ? " 🚫" : ""}</h3>

            <p>${escapeHtml(user.email)}</p>

            <p>FF UID :
            ${escapeHtml(user.ff_uid || "Not linked")}</p>

            <p>Phone :
            ${escapeHtml(user.phone || "Not provided")}</p>

            <p>Coins :
            ${Number(user.coins) || 0}</p>

            <p>Win Coins :
            ${Number(user.win_coins) || 0}</p>

            <p>Matches :
            ${Number(user.matches_played) || 0} played /
            ${Number(user.matches_won) || 0} won</p>

            <p>Role :
            ${escapeHtml(user.role || "user")}</p>

        `;

        container.appendChild(div);

    });

}

/* ==========================================================
            LOAD PENDING RECHARGES
========================================================== */

async function loadPendingRecharges() {
    if (remoteMode) {
        try {
            const data = await apiAdminRecharges("pending");
            pendingRecharges = (data.requests || []).map((r) => ({
                id: r.id,
                user_email: r.user_email,
                amount: Number(r.amount),
                utr_number: r.utr_number,
                status: r.status,
                created_at: r.created_at
            }));
            renderPendingRecharges();
            return;
        } catch (error) {
            showToast(error.message || "Could not load recharges.", "error");
        }
    }

    pendingRecharges =
        getPendingRecharges();

    renderPendingRecharges();

}

/* ==========================================================
        LOAD PENDING WITHDRAWS
========================================================== */

async function loadPendingWithdraws() {
    if (remoteMode) {
        try {
            const data = await apiAdminWithdraws("pending");
            pendingWithdraws = (data.requests || []).map((r) => ({
                id: r.id,
                user_email: r.user_email,
                amount: Number(r.amount),
                upi_id: r.upi_id,
                status: r.status,
                created_at: r.created_at
            }));
            renderPendingWithdraws();
            return;
        } catch (error) {
            showToast(error.message || "Could not load withdrawals.", "error");
        }
    }

    pendingWithdraws =
        getPendingWithdraws();

    renderPendingWithdraws();

}

/* ==========================================================
            RENDER PENDING RECHARGES
========================================================== */

function renderPendingRecharges() {

    const container =
        document.getElementById(
            "pending-recharges"
        );

    if (!container)
        return;

    container.innerHTML = "";

    if (
        pendingRecharges.length === 0
    ) {

        container.innerHTML =
            `<div class="admin-empty sm:col-span-2">No pending recharge requests on this device.<br><span style="font-size:.85rem">Recharge requests created on another phone/computer stay on that device.</span></div>`;

        return;

    }

    pendingRecharges.forEach(request => {

        const card =
            document.createElement("div");

        card.className =
            "admin-request-card";

        card.innerHTML = `

            <h3>₹${request.amount}</h3>

            <p>User :
            ${request.user_email}</p>

            <p>UTR :
            ${request.utr_number}</p>

            <p>Status :
            ${request.status}</p>

            <button
                class="approve-recharge"
                data-id="${request.id}">
                Approve
            </button>

            <button
                class="reject-recharge"
                data-id="${request.id}">
                Reject
            </button>

        `;

        container.appendChild(card);

    });

    bindRechargeAdminButtons();

}

/* ==========================================================
            RENDER PENDING WITHDRAWS
========================================================== */

function renderPendingWithdraws() {

    const container =
        document.getElementById(
            "pending-withdraws"
        );

    if (!container)
        return;

    container.innerHTML = "";

    if (
        pendingWithdraws.length === 0
    ) {

        container.innerHTML =
            `<div class="admin-empty sm:col-span-2">No pending withdrawal requests on this device.<br><span style="font-size:.85rem">Withdrawal requests created on another phone/computer stay on that device.</span></div>`;

        return;

    }

    pendingWithdraws.forEach(request => {

        const card =
            document.createElement("div");

        card.className =
            "admin-request-card";

        card.innerHTML = `

            <h3>₹${request.amount}</h3>

            <p>User :
            ${request.user_email}</p>

            <p>UPI :
            ${request.upi_id}</p>

            <p>Status :
            ${request.status}</p>

            <button
                class="approve-withdraw"
                data-id="${request.id}">
                Approve
            </button>

            <button
                class="reject-withdraw"
                data-id="${request.id}">
                Reject
            </button>

        `;

        container.appendChild(card);

    });

    bindWithdrawAdminButtons();

}

/* ==========================================================
                ADMIN BUTTONS
========================================================== */

function bindRechargeAdminButtons() {

    document
        .querySelectorAll(
            ".approve-recharge"
        )
        .forEach(button => {

            button.onclick =
                async function () {

                    const id =
                        this.dataset.id;

                    await approveRecharge(
                        id
                    );

                };

        });

    document
        .querySelectorAll(
            ".reject-recharge"
        )
        .forEach(button => {

            button.onclick =
                async function () {

                    const id =
                        this.dataset.id;

                    await rejectRecharge(
                        id
                    );

                };

        });

}

function bindWithdrawAdminButtons() {

    document
        .querySelectorAll(
            ".approve-withdraw"
        )
        .forEach(button => {

            button.onclick =
                async function () {

                    const id =
                        this.dataset.id;

                    await approveWithdraw(
                        id
                    );

                };

        });

    document
        .querySelectorAll(
            ".reject-withdraw"
        )
        .forEach(button => {

            button.onclick =
                async function () {

                    const id =
                        this.dataset.id;

                    await rejectWithdraw(
                        id
                    );

                };

        });

}

/* ==========================================================
        ADMIN ACTIONS — approve / reject (admin only)
========================================================== */

async function approveRecharge(id) {
    try {
        if (remoteMode) await apiPatchRecharge(id, "approve");
        else approveRechargeRequest(id);
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
        return;
    }
    showToast("Recharge approved.", "success");
    await loadPendingRecharges();
    await loadUsers();
}

async function rejectRecharge(id) {
    const reason =
        window.prompt(
            "Reason for rejecting this recharge (optional):"
        ) || null;
    try {
        if (remoteMode) await apiPatchRecharge(id, "reject", reason || "");
        else rejectRechargeRequest(id, reason);
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
        return;
    }
    showToast("Recharge rejected.", "success");
    await loadPendingRecharges();
}

async function approveWithdraw(id) {
    try {
        if (remoteMode) await apiPatchWithdraw(id, "approve");
        else approveWithdrawRequest(id);
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
        return;
    }
    showToast("Withdrawal marked as paid.", "success");
    await loadPendingWithdraws();
}

async function rejectWithdraw(id) {
    const reason =
        window.prompt(
            "Reason for rejecting this withdrawal (optional):"
        ) || null;
    try {
        if (remoteMode) await apiPatchWithdraw(id, "reject", reason || "");
        else rejectWithdrawRequest(id, reason);
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
        return;
    }
    showToast("Withdrawal rejected and coins refunded.", "success");
    await loadPendingWithdraws();
    await loadUsers();
}


/* ==========================================================
              ADMIN MATCH ROOMS (Lonewolf / CS Custom)
========================================================== */
const MATCH_ADMIN_IDS = ["lonewolf", "cs1v1"];

function formatTimeLabel(hhmm) {
    if (!hhmm || !hhmm.includes(":")) return "";
    const [hStr, mStr] = hhmm.split(":");
    const hours = Number(hStr);
    const minutes = Number(mStr);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return hhmm;
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = (hours % 12) || 12;
    return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

function loadMatchAdminForm(matchId) {
    const nameEl = document.getElementById(`${matchId}-room-name`);
    const passEl = document.getElementById(`${matchId}-room-password`);
    const descEl = document.getElementById(`${matchId}-description`);
    const modeEl = document.getElementById(`${matchId}-timing-mode`);
    const timeEl = document.getElementById(`${matchId}-timing-time`);
    const statusEl = document.getElementById(`${matchId}-admin-status`);

    if (nameEl) nameEl.value = localStorage.getItem(`${matchId}-room-name`) || "";
    if (passEl) passEl.value = localStorage.getItem(`${matchId}-room-password`) || "";
    if (descEl) descEl.value = localStorage.getItem(`${matchId}-description`) || "";

    const mode = localStorage.getItem(`${matchId}-timing-mode`) || "open";
    const time = localStorage.getItem(`${matchId}-room-deadline`) || "";
    if (modeEl) modeEl.value = mode;
    if (timeEl) timeEl.value = time;

    if (statusEl) {
        const hasRoom = !!(localStorage.getItem(`${matchId}-room-name`) && localStorage.getItem(`${matchId}-room-password`));
        if (!hasRoom) {
            statusEl.textContent = "Not configured yet.";
        } else if (mode === "open") {
            statusEl.textContent = "Saved · Join anytime · Room reveals after join.";
        } else if (mode === "before") {
            statusEl.textContent = `Saved · Join before ${formatTimeLabel(time) || "—"} · Room reveals 5 min before that time.`;
        } else if (mode === "at") {
            statusEl.textContent = `Saved · Room available at ${formatTimeLabel(time) || "—"} · Join allowed earlier; details unlock at that time.`;
        } else {
            statusEl.textContent = "Saved.";
        }
    }
}

function saveMatchAdmin(matchId, label) {
    const name = (document.getElementById(`${matchId}-room-name`)?.value || "").trim();
    const password = (document.getElementById(`${matchId}-room-password`)?.value || "").trim();
    const description = (document.getElementById(`${matchId}-description`)?.value || "").trim();
    const mode = document.getElementById(`${matchId}-timing-mode`)?.value || "open";
    const time = document.getElementById(`${matchId}-timing-time`)?.value || "";

    if (!name) {
        showToast("Room name is required.", "error");
        return;
    }
    if (!password) {
        showToast("Room password is required.", "error");
        return;
    }
    if ((mode === "before" || mode === "at") && !time) {
        showToast("Please set a time for this timing mode.", "error");
        return;
    }

    localStorage.setItem(`${matchId}-room-name`, name);
    localStorage.setItem(`${matchId}-room-password`, password);
    localStorage.setItem(`${matchId}-description`, description);
    localStorage.setItem(`${matchId}-timing-mode`, mode);

    if (mode === "open") {
        localStorage.removeItem(`${matchId}-room-deadline`);
    } else {
        localStorage.setItem(`${matchId}-room-deadline`, time);
    }

    if (remoteMode) {
        apiSaveRoom(matchId, {
            room_name: name,
            room_password: password,
            description,
            timing_mode: mode,
            deadline: mode === "open" ? null : time
        }).then(() => {
            loadMatchAdminForm(matchId);
            showToast(`${label} room saved to server.`, "success");
        }).catch((error) => {
            showToast(error.message || "Saved locally; server sync failed.", "error");
            loadMatchAdminForm(matchId);
        });
        return;
    }

    try {
        createRoom({ name: `${label}: ${name}`, password, description: description || `${label} room` });
    } catch (_) { /* ignore */ }

    loadMatchAdminForm(matchId);
    showToast(`${label} room saved.`, "success");
}

function clearMatchAdmin(matchId, label) {
    localStorage.removeItem(`${matchId}-room-name`);
    localStorage.removeItem(`${matchId}-room-password`);
    localStorage.removeItem(`${matchId}-description`);
    localStorage.removeItem(`${matchId}-room-deadline`);
    localStorage.removeItem(`${matchId}-timing-mode`);

    const nameEl = document.getElementById(`${matchId}-room-name`);
    const passEl = document.getElementById(`${matchId}-room-password`);
    const descEl = document.getElementById(`${matchId}-description`);
    const modeEl = document.getElementById(`${matchId}-timing-mode`);
    const timeEl = document.getElementById(`${matchId}-timing-time`);
    if (nameEl) nameEl.value = "";
    if (passEl) passEl.value = "";
    if (descEl) descEl.value = "";
    if (modeEl) modeEl.value = "open";
    if (timeEl) timeEl.value = "";

    if (remoteMode) {
        // Clears the server-side room AND removes both joined players so their
        // slot is freed for the next round — this used to only clear the
        // local form fields and left old participants "stuck" as filled slots.
        apiResetRoom(matchId).then(() => {
            loadMatchAdminForm(matchId);
            showToast(`${label} room reset — joined players cleared.`, "success");
        }).catch((error) => {
            showToast(error.message || "Reset failed on server.", "error");
            loadMatchAdminForm(matchId);
        });
        return;
    }

    loadMatchAdminForm(matchId);
    showToast(`${label} room cleared.`, "success");
}

function initAdminRooms() {
    const configs = [
        { id: "lonewolf", label: "Lonewolf 1v1" },
        { id: "cs1v1", label: "CS Custom 1v1" }
    ];

    configs.forEach(({ id, label }) => {
        loadMatchAdminForm(id);
        document.getElementById(`${id}-save-button`)?.addEventListener("click", () => saveMatchAdmin(id, label));
        document.getElementById(`${id}-clear-button`)?.addEventListener("click", () => clearMatchAdmin(id, label));
    });
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
    }[ch]));
}

/* ==========================================================
                    INIT / BOOTSTRAP
========================================================== */

async function init() {

    cacheDom();

    const authenticated =
        await checkAuthentication();

    if (!authenticated)
        return;

    await loadCurrentProfile();

    if (!currentProfile)
        return;

    if (ui.logoutButton) {

        ui.logoutButton.addEventListener(
            "click",
            async () => {

                await logout();
                apiLogout();

                // Prevent the protected dashboard from remaining in browser history.
                window.location.replace("login.html");

            }
        );

    }

    bindRechargeButton();
    bindWithdrawButton();

    if (!remoteMode) {
        remoteMode = await isRemoteApiAvailable();
    }
    if (remoteMode) {
        showToast("Connected to shared server — data syncs across devices.", "success", 3200);
    }

    if (isAdmin()) {

        showAdminPanel();

        ui.adminPanel = document.getElementById("admin-panel");
        ui.userPanel = document.getElementById("user-panel");

        await loadUsers();
        await loadPendingRecharges();
        await loadPendingWithdraws();
        initAdminRooms();

        setTimeout(() => {
            renderUsers();
            renderPendingRecharges();
            renderPendingWithdraws();
        }, 50);

    } else {

        showUserPanel();

        await refreshWallet();
        await refreshRequests();
        initOperatorCard();

    }

}


/* ==========================================================
                  OPERATOR ID CARD
   Cosmetic only — never changes wallet/economy.
========================================================== */
function initOperatorCard() {
    if (!currentProfile) return;
    const card = document.getElementById("operator-card");
    const flip = document.getElementById("operator-flip");
    const flipBack = document.getElementById("operator-flip-back");
    const grid = document.getElementById("emblem-grid");
    if (!card || !grid) return;

    const profile = currentProfile;
    const name = profile.username || "OPERATOR";
    const wins = Number(profile.matches_won) || 0;
    const matches = Number(profile.matches_played) || 0;
    const rate = matches ? Math.round((wins / matches) * 100) : 0;
    const xp = wins * 100 + Math.max(0, matches - wins) * 20;
    const ranks = [
        {name:"ROOKIE", min:0, next:100}, {name:"SCOUT", min:100, next:250},
        {name:"VANGUARD", min:250, next:500}, {name:"ELITE", min:500, next:900},
        {name:"TITAN", min:900, next:1500}, {name:"VALHALLAN", min:1500, next:999999}
    ];
    const rank = [...ranks].reverse().find(r => xp >= r.min) || ranks[0];
    const next = ranks[ranks.indexOf(rank) + 1];
    const progress = rank.next === 999999 ? 100 : Math.min(100, ((xp-rank.min)/(rank.next-rank.min))*100);
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

    set("operator-name", name.toUpperCase());
    set("operator-rank", rank.name);
    set("operator-wins", wins);
    set("operator-matches", matches);
    set("operator-rate", `${rate}%`);
    set("operator-xp", `${xp} XP`);
    set("operator-next-label", next ? `NEXT // ${next.name}` : "MAX RANK");
    set("operator-uid", `ID // ${(profile.ff_uid || profile.id || "LOCAL").toString().slice(-10).toUpperCase()}`);
    const avatar = document.getElementById("operator-avatar");
    if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
    const bar = document.getElementById("operator-progress-bar");
    if (bar) bar.style.width = `${progress}%`;

    const key = "operator-emblem";
    const saved = localStorage.getItem(key) || "⚔️";
    const preview = document.getElementById("operator-emblem-preview");
    if (preview) preview.textContent = saved;
    grid.querySelectorAll("[data-emblem]").forEach(button => {
        button.classList.toggle("is-selected", button.dataset.emblem === saved);
        button.addEventListener("click", () => {
            localStorage.setItem(key, button.dataset.emblem);
            if (preview) preview.textContent = button.dataset.emblem;
            grid.querySelectorAll("[data-emblem]").forEach(b => b.classList.toggle("is-selected", b === button));
            showToast(`Squad emblem changed to ${button.dataset.emblem}`, "info", 2200);
        });
    });
    flip?.addEventListener("click", () => card.classList.toggle("is-flipped"));
    flipBack?.addEventListener("click", () => card.classList.remove("is-flipped"));
}


// Boot the dashboard after the module has loaded.
document.addEventListener("DOMContentLoaded", init);
