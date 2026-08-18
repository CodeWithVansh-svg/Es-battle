/* ==========================================================
   TOAST — optimized enter/exit (transform + opacity only)
========================================================== */

const ICONS = {
    success: '✓',
    error: '!',
    info: 'i',
    bonus: '★'
};

const LABELS = {
    success: 'Success',
    error: 'Error',
    info: 'Info',
    bonus: 'Bonus'
};

const MAX_VISIBLE = 4;

let container = null;

function ensureContainer() {
    if (container && document.body.contains(container)) return container;

    container = document.createElement('div');
    container.id = 'toast-stack';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
    return container;
}

function trimStack(stack) {
    const items = stack.querySelectorAll('.hud-toast:not(.hud-toast--leaving)');
    if (items.length <= MAX_VISIBLE) return;
    const overflow = items.length - MAX_VISIBLE;
    for (let i = 0; i < overflow; i++) {
        const el = items[i];
        el.classList.add('hud-toast--leaving');
        window.setTimeout(() => el.remove(), 220);
    }
}

export function showToast(message, type = 'info', duration = 4000) {
    const stack = ensureContainer();
    const kind = ICONS[type] ? type : 'info';

    const toast = document.createElement('div');
    toast.className = `hud-toast hud-toast--${kind}`;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    const progressHtml =
        duration > 0
            ? `<span class="hud-toast-progress" style="animation-duration:${duration}ms"></span>`
            : '';

    toast.innerHTML = `
        <span class="hud-toast-icon" aria-hidden="true">${ICONS[kind]}</span>
        <div class="hud-toast-body">
            <span class="hud-toast-label">${LABELS[kind]}</span>
            <span class="hud-toast-message"></span>
        </div>
        <button type="button" class="hud-toast-close" aria-label="Dismiss">×</button>
        ${progressHtml}
    `;

    toast.querySelector('.hud-toast-message').textContent = message;

    let removed = false;
    let exitTimer = 0;
    let lifeTimer = 0;

    const remove = () => {
        if (removed) return;
        removed = true;
        if (lifeTimer) window.clearTimeout(lifeTimer);
        toast.classList.add('hud-toast--leaving');
        toast.classList.remove('hud-toast--settled');

        const onEnd = (e) => {
            if (e && e.target !== toast) return;
            toast.removeEventListener('animationend', onEnd);
            toast.remove();
        };
        toast.addEventListener('animationend', onEnd);
        // Fallback if animationend is skipped (tab hidden / reduced motion)
        exitTimer = window.setTimeout(() => {
            toast.removeEventListener('animationend', onEnd);
            if (toast.parentNode) toast.remove();
        }, 240);
    };

    toast.querySelector('.hud-toast-close').addEventListener('click', remove);

    // Batch DOM write on next frame for smoother paint
    requestAnimationFrame(() => {
        trimStack(stack);
        stack.appendChild(toast);
        // Free will-change after enter animation
        window.setTimeout(() => {
            if (!removed) toast.classList.add('hud-toast--settled');
        }, 300);
    });

    if (duration > 0) {
        lifeTimer = window.setTimeout(remove, duration);
    }

    return remove;
}
