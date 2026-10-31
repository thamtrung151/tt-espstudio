import { t, onLocaleChange } from './i18n';
import type { User } from 'firebase/auth';
import type { createGoogleAccount } from '../auth/google';
export function initAccount() {
  const header = document.getElementById('account') as HTMLButtonElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'account-dialog'; dialog.setAttribute('aria-labelledby', 'account-title');
  dialog.innerHTML = '<div class="dialog-heading"><h2 id="account-title"></h2><button id="account-close" type="button"></button></div>'
    + '<p id="account-name"></p><p id="account-email"></p><p id="account-status" role="status" aria-live="polite"></p>'
    + '<p id="account-storage" class="muted"></p><p id="account-privacy" class="muted"></p><button id="account-action" type="button"></button>';
  document.body.append(dialog);
  const el = (id: string) => dialog.querySelector<HTMLElement>('#'+id)!;
  const action = el('account-action') as HTMLButtonElement;
  const close = el('account-close') as HTMLButtonElement;
  let user: User | null = null;
  let service: ReturnType<typeof createGoogleAccount> | undefined;
  let busy = true;
  let pending = false;
  let status = 'Đang kiểm tra phiên đăng nhập…';
  let errorText: ((error: unknown) => string) | undefined;
  function render() {
    header.textContent = user ? (user.displayName || user.email || 'U').slice(0, 1).toUpperCase() : 'T';
    header.title = user?.displayName || t('Tài khoản');
    header.setAttribute('aria-label', user?.displayName || t('Tài khoản'));
    header.classList.toggle('signed-in', !!user);
    el('account-title').textContent = t('Tài khoản');
    close.textContent = '×'; close.setAttribute('aria-label', t('Đóng'));
    el('account-name').textContent = user?.displayName || t('Khách');
    el('account-email').textContent = user?.email || '';
    el('account-status').textContent = t(status);
    el('account-storage').textContent = t('Project vẫn lưu trong trình duyệt này, chưa đồng bộ theo tài khoản. Đăng xuất không xóa project trên máy.');
    el('account-privacy').textContent = t('Đăng nhập chia sẻ tên, email và định danh Google với Firebase để tạo tài khoản. Phiên được giữ trong tab này. Không yêu cầu quyền Drive hoặc Gmail.');
    action.textContent = t(busy || pending ? 'Đang xử lý…' : user ? 'Đăng xuất' : 'Đăng nhập bằng Google');
    action.disabled = busy || pending || !service;
  }
  header.onclick = () => { render(); if (!dialog.open) dialog.showModal(); };
  close.onclick = () => dialog.close();
  action.onclick = async () => {
    if (busy || pending || !service) return;
    const loggingOut = !!user;
    pending = true; status = loggingOut ? 'Đang đăng xuất…' : 'Đang chờ Google xác nhận…'; render();
    try {
      if (loggingOut) await service.logout(); else await service.login();
      status = loggingOut ? 'Đã đăng xuất.' : 'Đã đăng nhập.';
    } catch (error) { status = errorText?.(error) || 'Không thể đăng nhập. Vui lòng thử lại sau.'; }
    finally { pending = false; render(); }
  };
  onLocaleChange(render); render();
  const raw = import.meta.env.VITE_FIREBASE_CONFIG;
  if (!raw) { busy = false; status = 'Đăng nhập Google đang được chuẩn bị. Bạn vẫn có thể sử dụng editor ở chế độ khách.'; render(); return; }
  void import('../auth/google').then(module => {
    errorText = module.authError;
    const config = module.parseAuthConfig(raw);
    if (!config) throw new Error('Invalid auth configuration');
    service = module.createGoogleAccount(config);
    service.observe(next => {
      user = next; busy = false; status = user ? 'Đã đăng nhập.' : 'Chưa đăng nhập.'; render();
    }, error => { service = undefined; busy = false; status = module.authError(error); render(); });
  }).catch(() => {
    service = undefined; busy = false;
    status = 'Không thể khởi tạo đăng nhập. Bạn vẫn có thể sử dụng editor ở chế độ khách.'; render();
  });
}
