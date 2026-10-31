import { describe, it, expect, vi } from 'vitest';
const sdk = vi.hoisted(() => ({
  app: vi.fn(() => ({})), auth: vi.fn(() => ({ name: 'isolated-auth' })),
  observe: vi.fn(), login: vi.fn(() => Promise.resolve()), logout: vi.fn(() => Promise.resolve()),
  params: vi.fn(),
}));
vi.mock('firebase/app', () => ({ initializeApp: sdk.app }));
vi.mock('firebase/auth', () => ({
  initializeAuth: sdk.auth, browserSessionPersistence: 'session', browserPopupRedirectResolver: 'popup',
  GoogleAuthProvider: class { setCustomParameters = sdk.params; },
  onAuthStateChanged: sdk.observe, signInWithPopup: sdk.login, signOut: sdk.logout,
}));
import { parseAuthConfig, createGoogleAccount, authError } from '../src/auth/google';
const config = { apiKey: 'test-key', authDomain: 'test.firebaseapp.com', projectId: 'test', appId: 'test-app' };
describe('Google account boundary', () => {
  it('rejects missing, malformed or incomplete config without requiring login', () => {
    for (const raw of [undefined, '', '{}', 'null', 'bad json', JSON.stringify({ ...config, authDomain: 'https://evil.test/x' })]) {
      expect(parseAuthConfig(raw)).toBeNull();
    }
  });
  it('retains only web configuration fields', () => {
    expect(parseAuthConfig(JSON.stringify({ ...config, extra: 'ignored' }))).toEqual(config);
  });
  it('uses session persistence and SDK authentication, not a locally decoded token', async () => {
    const account = createGoogleAccount(config);
    expect(sdk.auth).toHaveBeenCalledWith(expect.anything(), { persistence: 'session', popupRedirectResolver: 'popup' });
    expect(sdk.params).toHaveBeenCalledWith({ prompt: 'select_account' });
    const next = vi.fn(), error = vi.fn();
    account.observe(next, error);
    expect(sdk.observe).toHaveBeenCalledWith({ name: 'isolated-auth' }, next, error);
    await account.login(); await account.logout();
    expect(sdk.login).toHaveBeenCalledWith({ name: 'isolated-auth' }, expect.anything());
    expect(sdk.logout).toHaveBeenCalledWith({ name: 'isolated-auth' });
  });
  it('does not expose raw provider errors or credentials', () => {
    expect(authError({ code: 'unknown', message: 'private-token' })).not.toContain('private-token');
    expect(authError({ code: 'auth/popup-blocked' })).toContain('Google');
  });
});
