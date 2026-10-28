import { spawn } from 'node:child_process';
import path from 'node:path';

export type ConsentRequest = { kind: 'pair'; origin: string } | { kind: 'upload'; origin: string; port: string; target: string; buildId: string };

/** Local UI, independent of browser JavaScript. Missing UI/error/timeout always denies. */
export function createNativeConsent(script: string) {
  let active = false;
  return async (request: ConsentRequest): Promise<boolean> => {
    if (process.platform !== 'win32' || active) return false;
    active = true;
    try {
      const message = request.kind === 'pair'
        ? `Cho phép website sau dùng compiler trên máy này trong 8 giờ?\n\n${request.origin}\n\nChỉ chọn Có nếu chính bạn vừa bấm ghép nối tại website này. Nạp firmware sẽ cần xác nhận riêng.`
        : `Nạp firmware và thay chương trình hiện tại trên board?\n\nWebsite: ${request.origin}\nCổng: ${request.port}\nTarget: ${request.target}\nBuild: ${request.buildId}\n\nKiểm tra board và dây nối. Chọn Có để bắt đầu nạp.`;
      return await new Promise<boolean>(resolve => {
        const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        // No user-controlled shell text: fixed script, message passed as data through env.
        const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script], {
          windowsHide: true, shell: false, stdio: 'ignore', env: { ...process.env, ESPSTUDIO_CONSENT_TEXT: message },
        });
        const timer = setTimeout(() => { child.kill(); resolve(false); }, 125000);
        child.once('error', () => { clearTimeout(timer); resolve(false); });
        child.once('close', code => { clearTimeout(timer); resolve(code === 0); });
      });
    } finally { active = false; }
  };
}
