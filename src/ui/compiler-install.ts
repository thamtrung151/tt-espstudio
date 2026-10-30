import type { CompilerService } from '../compiler';

export const AGENT_RELEASE = 'https://github.com/thamtrung151/tt-espstudio/releases/tag/v0.4.9';
export const AGENT_INSTALLER = 'https://github.com/thamtrung151/tt-espstudio/releases/download/v0.4.9/TTESPStudio-Agent-0.4.9-win-x64.exe';

/** Unreachable does not mean uninstalled: the browser cannot inspect installed apps. */
export function initCompilerInstall(compiler: CompilerService, connect: () => void, connecting: () => boolean) {
  const panel = document.createElement('section');
  panel.id = 'compiler-install-guide'; panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'compiler-install-title');
  panel.innerHTML = `<button id="compiler-install-close" class="quiet" aria-label="Đóng">×</button>
    <strong id="compiler-install-title">Chưa kết nối Compiler</strong>
    <p>Cài TT ESPStudio Agent nếu đây là máy mới. Nếu đã cài, mở Agent rồi bấm Kết nối.</p>
    <div class="compiler-install-actions"><a id="compiler-download" class="primary" href="${AGENT_INSTALLER}" target="_blank" rel="noopener noreferrer">Tải Agent cho Windows</a><button id="compiler-install-connect">Kết nối</button></div>
    <p class="muted">Windows 10/11 · x64 · khoảng 36 MB. Lần biên dịch đầu cần Internet để tải công cụ cho chip.</p>
    <p class="muted">Cài xong, bấm Kết nối và cho phép trình duyệt mở Agent. Nếu vẫn chưa kết nối được, kiểm tra quyền truy cập mạng cục bộ của website.</p>
    <a class="compiler-release-link" href="${AGENT_RELEASE}" target="_blank" rel="noopener noreferrer">Chi tiết bản phát hành</a>`;
  document.body.append(panel);
  let dismissed = false;
  const hide = () => { panel.hidden = true; document.body.classList.remove('compiler-guide-visible'); };
  const show = (explicit = false) => {
    if (!compiler.isAgent || (!explicit && dismissed)) return;
    panel.hidden = false; document.body.classList.add('compiler-guide-visible');
  };
  panel.querySelector<HTMLButtonElement>('#compiler-install-close')!.onclick = () => { dismissed = true; hide(); };
  panel.querySelector<HTMLButtonElement>('#compiler-install-connect')!.onclick = connect;
  const setBusy = (busy: boolean) => { panel.querySelector<HTMLButtonElement>('#compiler-install-connect')!.disabled = busy; };
  const probe = async () => {
    if (!compiler.isAgent || compiler.token) return;
    try { await compiler.request('health'); }
    catch { if (!compiler.token && !connecting()) show(); }
  };
  return { show, hide, setBusy, probe };
}
