/* ==========================================================
   TOAST — HUD-style notification popups shared across pages.
========================================================== */

const ICONS = {
    success: '✓',
    error: '!',
    info: 'i',
    bonus: '★'
};

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

export function showToast(message, type = 'info', duration = 4000) {
    const stack = ensureContainer();

    const toast = document.createElement('div');
    toast.className = `hud-toast hud-toast--${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    toast.innerHTML = `
        <span class="hud-toast-icon">${ICONS[type] || ICONS.info}</span>
        <span class="hud-toast-message"></span>
        <button type="button" class="hud-toast-close" aria-label="Dismiss">×</button>
    `;

    toast.querySelector('.hud-toast-message').textContent = message;

    const remove = () => {
        toast.classList.add('hud-toast--leaving');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    toast.querySelector('.hud-toast-close').addEventListener('click', remove);

    stack.appendChild(toast);

    if (duration > 0) {
        window.setTimeout(remove, duration);
    }

    return remove;
}
