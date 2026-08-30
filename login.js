import {
    loadUsers,
    saveUsers,
    setCurrentUser,
    saveRememberedLogin,
    clearRememberedLogin,
    loadRememberedLogin,
    getCurrentUser,
    hashLocalPassword,
    verifyLocalPassword
} from './js/local-db.js';

import {
    isRemoteApiAvailable,
    apiLogin,
    apiRegister,
    apiResetRequest,
    apiResetConfirm,
    setToken,
    apiLogout
} from './js/api-client.js';

async function registerUser(username, email, password, phone, ffUid) {
    try {
        if (await isRemoteApiAvailable()) {
            const data = await apiRegister({
                username,
                email,
                password,
                phone,
                ffUid
            });

            setCurrentUser({
                username: data.user.username,
                email: data.user.email,
                phone: data.user.phone,
                ffUid: data.user.ff_uid,
                role: data.user.role
            });

            return {
                success: true,
                message: 'Account created successfully. You can now log in.',
                remote: true
            };
        }
    } catch (error) {
        return {
            success: false,
            message: error.message || 'Registration failed on server.'
        };
    }

    const users = loadUsers();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    const normalizedFfUid = (ffUid || '').trim();

    const emailExists = users.some(
        (user) => user.email === normalizedEmail
    );

    const usernameExists = users.some(
        (user) =>
            user.username.trim().toLowerCase() === normalizedUsername
    );

    const phoneExists = users.some(
        (user) => user.phone === normalizedPhone
    );

    const ffUidExists = users.some(
        (user) => user.ffUid === normalizedFfUid
    );

    if (!normalizedPhone) {
        return {
            success: false,
            message: 'Phone number is required.'
        };
    }

    if (!password || password.length < 6) {
        return {
            success: false,
            message: 'Password must be at least 6 characters.'
        };
    }

    if (!/^[0-9]{6,12}$/.test(normalizedFfUid)) {
        return {
            success: false,
            message: 'Enter a valid Free Fire UID (6-12 digits).'
        };
    }

    if (emailExists && usernameExists) {
        return {
            success: false,
            message: 'That email and username are already registered.'
        };
    }

    if (emailExists) {
        return {
            success: false,
            message: 'An account with that email already exists.'
        };
    }

    if (usernameExists) {
        return {
            success: false,
            message: 'That Free Fire IGN is already registered.'
        };
    }

    if (phoneExists) {
        return {
            success: false,
            message: 'That phone number is already registered.'
        };
    }

    if (ffUidExists) {
        return {
            success: false,
            message: 'That Free Fire UID is already linked to another account.'
        };
    }

    users.push({
        id: Date.now(),
        username: username.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        ffUid: normalizedFfUid,
        passwordHash: await hashLocalPassword(password),
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
            lonewolf: {
                participated: false,
                roomName: '',
                roomPassword: ''
            },
            cs1v1: {
                participated: false,
                roomName: '',
                roomPassword: ''
            }
        }
    });

    saveUsers(users);

    setCurrentUser({
        username: username.trim(),
        email: normalizedEmail
    });

    return {
        success: true,
        message: 'Account created successfully. You can now log in.'
    };
}

async function loginUser(email, password) {
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

            return {
                success: true,
                message: `Welcome back, ${data.user.username}!`,
                remote: true
            };
        }
    } catch (error) {
        if (error.status === 401 || error.status === 403) {
            return {
                success: false,
                message:
                    error.message ||
                    'Invalid email or password.'
            };
        }

        console.warn(
            'Remote login unavailable, using local mode:',
            error.message
        );
    }

    const users = loadUsers();
    const normalizedEmail = email.trim().toLowerCase();

    const user = users.find(
        (entry) => entry.email === normalizedEmail
    );

    if (
        !user ||
        !(await verifyLocalPassword(
            password,
            user.passwordHash
        ))
    ) {
        return {
            success: false,
            message: 'Invalid email or password.'
        };
    }

    if (user.isBanned) {
        return {
            success: false,
            message:
                'This account has been suspended. Contact an admin.'
        };
    }

    setCurrentUser({
        username: user.username,
        email: user.email
    });

    return {
        success: true,
        message: `Welcome back, ${user.username}!`
    };
}

async function requestPasswordReset(email, phone, ffUid) {
    try {
        if (await isRemoteApiAvailable()) {
            const data = await apiResetRequest({
                email,
                phone,
                ffUid
            });

            return {
                success: true,
                message: data.message,
                resetToken: data.resetToken || null,
                remote: true
            };
        }
    } catch (error) {
        return {
            success: false,
            message:
                error.message ||
                'Reset request failed.'
        };
    }

    const users = loadUsers();

    const normalizedEmail =
        email.trim().toLowerCase();

    const normalizedPhone =
        (phone || '').trim();

    const normalizedFfUid =
        (ffUid || '').trim();

    if (!normalizedPhone && !normalizedFfUid) {
        return {
            success: false,
            message:
                'Enter your phone number or Free Fire UID to verify your identity.'
        };
    }

    const user = users.find(
        (entry) =>
            entry.email === normalizedEmail
    );

    const matches =
        user &&
        (
            (
                normalizedPhone &&
                user.phone === normalizedPhone
            ) ||
            (
                normalizedFfUid &&
                user.ffUid === normalizedFfUid
            )
        );

    if (!matches) {
        return {
            success: false,
            message:
                'Those details do not match an account on this device.'
        };
    }

    return {
        success: true,
        message:
            'Verified — you can set a new password now.',
        remote: false
    };
}

async function confirmPasswordReset({
    remote,
    resetToken,
    email,
    newPassword,
    confirmPassword
}) {
    if (newPassword.length < 6) {
        return {
            success: false,
            message:
                'Password must be at least 6 characters long.'
        };
    }

    if (newPassword !== confirmPassword) {
        return {
            success: false,
            message:
                'Passwords do not match.'
        };
    }

    if (remote) {
        try {
            const data =
                await apiResetConfirm({
                    token: resetToken,
                    newPassword
                });

            return {
                success: true,
                message: data.message
            };
        } catch (error) {
            return {
                success: false,
                message:
                    error.message ||
                    'Reset failed.'
            };
        }
    }

    const users = loadUsers();

    const normalizedEmail =
        email.trim().toLowerCase();

    const user = users.find(
        (entry) =>
            entry.email === normalizedEmail
    );

    if (!user) {
        return {
            success: false,
            message:
                'No account found with that email.'
        };
    }

    user.passwordHash =
        await hashLocalPassword(newPassword);

    saveUsers(users);

    return {
        success: true,
        message:
            'Password updated successfully. You can now log in.'
    };
}

function prefillRememberedLogin() {
    const loginForm =
        document.getElementById('login-form');

    if (!loginForm) {
        return;
    }

    const remembered =
        loadRememberedLogin();

    if (!remembered) {
        return;
    }

    if (loginForm.email) {
        loginForm.email.value =
            remembered.email || '';
    }

    const rememberCheckbox =
        document.getElementById(
            'remember-me'
        );

    if (rememberCheckbox) {
        rememberCheckbox.checked = true;
    }
}

function showMessage(
    messageElement,
    message,
    type = 'info'
) {
    if (!messageElement) {
        return;
    }

    messageElement.textContent =
        message;

    messageElement.classList.remove(
        'info',
        'success',
        'error'
    );

    messageElement.classList.add(
        'message',
        type
    );
}

function attachFormHandlers() {
    const loginForm =
        document.getElementById(
            'login-form'
        );

    const registerForm =
        document.getElementById(
            'register-form'
        );

    const forgotPasswordForm =
        document.getElementById(
            'forgot-password-form'
        );

    const messageBox =
        document.getElementById(
            'message'
        );

    if (loginForm) {
        loginForm.addEventListener(
            'submit',
            async (event) => {
                event.preventDefault();

                const email =
                    loginForm.email.value;

                const password =
                    loginForm.password.value;

                const rememberMe =
                    document.getElementById(
                        'remember-me'
                    )?.checked || false;

                const result =
                    await loginUser(
                        email,
                        password
                    );

                showMessage(
                    messageBox,
                    result.message,
                    result.success
                        ? 'success'
                        : 'error'
                );

                if (result.success) {
                    if (rememberMe) {
                        saveRememberedLogin(
                            email.trim()
                        );
                    } else {
                        clearRememberedLogin();
                    }

                    loginForm.reset();

                    const normalizedEmail =
                        email
                            .trim()
                            .toLowerCase();

                    window.location.href =
                        `index.html?user=${encodeURIComponent(
                            normalizedEmail
                        )}`;
                }
            }
        );
    }

    if (registerForm) {
        registerForm.addEventListener(
            'submit',
            async (event) => {
                event.preventDefault();

                const username =
                    registerForm.username.value;

                const email =
                    registerForm.email.value;

                const phone =
                    registerForm.phone.value;

                const password =
                    registerForm.password.value;

                const ffUid =
                    registerForm.ffUid.value;

                const result =
                    await registerUser(
                        username,
                        email,
                        password,
                        phone,
                        ffUid
                    );

                showMessage(
                    messageBox,
                    result.message,
                    result.success
                        ? 'success'
                        : 'error'
                );

                if (result.success) {
                    registerForm.reset();

                    const normalizedEmail =
                        email
                            .trim()
                            .toLowerCase();

                    window.location.href =
                        `index.html?user=${encodeURIComponent(
                            normalizedEmail
                        )}`;
                }
            }
        );
    }

    if (forgotPasswordForm) {
        let pendingReset = null;

        forgotPasswordForm.addEventListener(
            'submit',
            async (event) => {
                event.preventDefault();

                const email =
                    forgotPasswordForm.email.value;

                const newPassword =
                    forgotPasswordForm
                        .newPassword.value;

                const confirmPassword =
                    forgotPasswordForm
                        .confirmPassword.value;

                if (
                    !pendingReset ||
                    pendingReset.email !==
                        email.trim().toLowerCase()
                ) {
                    const phone =
                        forgotPasswordForm
                            .phone?.value || '';

                    const ffUid =
                        forgotPasswordForm
                            .ffUid?.value || '';

                    const verifyResult =
                        await requestPasswordReset(
                            email,
                            phone,
                            ffUid
                        );

                    showMessage(
                        messageBox,
                        verifyResult.message,
                        verifyResult.success
                            ? 'success'
                            : 'error'
                    );

                    if (!verifyResult.success) {
                        return;
                    }

                    pendingReset = {
                        remote:
                            verifyResult.remote,
                        resetToken:
                            verifyResult.resetToken,
                        email:
                            email
                                .trim()
                                .toLowerCase()
                    };

                    showMessage(
                        messageBox,
                        `${verifyResult.message} Now enter your new password and submit again.`,
                        'success'
                    );

                    return;
                }

                const result =
                    await confirmPasswordReset({
                        remote:
                            pendingReset.remote,
                        resetToken:
                            pendingReset.resetToken,
                        email,
                        newPassword,
                        confirmPassword
                    });

                showMessage(
                    messageBox,
                    result.message,
                    result.success
                        ? 'success'
                        : 'error'
                );

                if (result.success) {
                    pendingReset = null;
                    forgotPasswordForm.reset();
                }
            }
        );
    }
}

document.addEventListener(
    'DOMContentLoaded',
    () => {
        if (getCurrentUser()) {
            window.location.replace(
                'index.html'
            );
            return;
        }

        attachFormHandlers();
        prefillRememberedLogin();
    }
);
