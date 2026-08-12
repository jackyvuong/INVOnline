const TOAST_DURATION = 3200;

let toastRoot: HTMLElement | null = null;

function ensureRoot() {
  if (toastRoot && document.body.contains(toastRoot)) return toastRoot;
  toastRoot = document.createElement('div');
  toastRoot.className = 'toast-container';
  toastRoot.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastRoot);
  return toastRoot;
}

export function showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = TOAST_DURATION) {
  const root = ensureRoot();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');

  const icons = { success: '✓', error: '!', warning: '⚠', info: 'i' };
  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${icons[type]}</span>
    <span class="toast__message"></span>
    <button type="button" class="toast__close" aria-label="Đóng">×</button>
  `;
  toast.querySelector('.toast__message')!.textContent = message;

  const remove = () => {
    toast.classList.add('toast--out');
    setTimeout(() => toast.remove(), 220);
  };

  toast.querySelector('.toast__close')!.addEventListener('click', remove);
  root.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--in'));
  if (duration > 0) setTimeout(remove, duration);
}

export const notify = {
  success: (msg: string) => showToast(msg, 'success'),
  error: (msg: string) => showToast(msg, 'error'),
  warning: (msg: string) => showToast(msg, 'warning'),
  info: (msg: string) => showToast(msg, 'info'),
};
