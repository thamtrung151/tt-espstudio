import { initializeApp } from 'firebase/app';
import { initializeAuth, browserSessionPersistence, browserPopupRedirectResolver, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
export type WebAuthConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };
export function parseAuthConfig(raw: unknown): WebAuthConfig | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const keys = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;
    if (keys.some(key => typeof value[key] !== 'string' || !value[key].trim())) return null;
    if (!/^[a-zA-Z0-9.-]+$/.test(value.authDomain)) return null;
    return Object.fromEntries(keys.map(key => [key, value[key].trim()])) as WebAuthConfig;
  } catch { return null; }
}
export function authError(error: unknown): string {
  switch ((error as { code?: string })?.code) {
    case 'auth/popup-closed-by-user': return 'Bạn đã đóng cửa sổ đăng nhập.';
    case 'auth/popup-blocked': return 'Trình duyệt chặn cửa sổ Google. Cho phép cửa sổ bật lên rồi thử lại.';
    case 'auth/network-request-failed': return 'Không kết nối được dịch vụ đăng nhập. Kiểm tra Internet rồi thử lại.';
    case 'auth/unauthorized-domain': return 'Tên miền này chưa được cấu hình để đăng nhập Google.';
    case 'auth/operation-not-allowed': return 'Đăng nhập Google chưa được bật cho website.';
    default: return 'Không thể đăng nhập. Vui lòng thử lại sau.';
  }
}
export function createGoogleAccount(config: WebAuthConfig) {
  const app = initializeApp(config, 'espstudio-account');
  // Account tokens never reach Compiler Agent. Persist only in this tab.
  const auth = initializeAuth(app, { persistence: browserSessionPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return {
    observe: (next: (user: User | null) => void, error: (error: unknown) => void) => onAuthStateChanged(auth, next, error),
    login: () => signInWithPopup(auth, provider),
    logout: () => signOut(auth),
  };
}
