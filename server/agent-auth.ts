import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

export const AGENT_API_VERSION = 1;
export const AGENT_VERSION = '0.3.0-preview.4';
type Pending = { id: string; code: string; expires: number; attempts: number };
type NativePending = { origin: string; secret: string; expires: number; state: 'pending' | 'approved' | 'denied' };
export class AgentAuth {
  private pending = new Map<string, Pending>();
  private nativePending = new Map<string, NativePending>();
  private nativeCooldown = new Map<string, number>();
  private sessions = new Map<string, { origin: string; expires: number }>();
  constructor(readonly origins: Set<string>, private announce: (origin: string, code: string) => void, private now = Date.now) {}
  request(origin: string) {
    if (!this.origins.has(origin)) throw new Error('Website không được phép.');
    const existing = this.pending.get(origin);
    if (existing && existing.expires > this.now()) return { requestId: existing.id, expiresAt: existing.expires };
    const pending = { id: randomUUID(), code: String(randomInt(10000000, 100000000)), expires: this.now() + 300000, attempts: 0 };
    this.pending.set(origin, pending); this.announce(origin, pending.code);
    return { requestId: pending.id, expiresAt: pending.expires };
  }
  confirm(origin: string, id: string, code: string) {
    const pending = this.pending.get(origin);
    if (!pending || pending.id !== id || pending.expires <= this.now() || pending.attempts >= 5) throw new Error('Yêu cầu ghép nối hết hạn hoặc đã thử quá 5 lần.');
    pending.attempts++;
    if (!/^\d{8}$/.test(code) || !timingSafeEqual(Buffer.from(pending.code), Buffer.from(code))) throw new Error('Mã ghép nối không đúng.');
    this.pending.delete(origin);
    return this.issue(origin);
  }
  private issue(origin: string) {
    for (const [key, session] of this.sessions) if (session.expires <= this.now()) this.sessions.delete(key);
    if (this.sessions.size >= 32) throw new Error('Quá nhiều phiên. Khởi động lại Agent để thu hồi các phiên.');
    const token = randomBytes(32).toString('hex'); const expiresAt = this.now() + 8 * 60 * 60 * 1000;
    this.sessions.set(token, { origin, expires: expiresAt });
    return { token, expiresAt, apiVersion: AGENT_API_VERSION };
  }
  requestNative(origin: string, approve: (origin: string) => Promise<boolean>) {
    if (!this.origins.has(origin)) throw new Error('Website không được phép.');
    for (const [id, pending] of this.nativePending) if (pending.expires <= this.now()) this.nativePending.delete(id);
    if ([...this.nativePending.values()].some(p => p.origin === origin) || (this.nativeCooldown.get(origin) ?? 0) > this.now()) throw new Error('Đang có yêu cầu ghép nối hoặc cần chờ 30 giây trước khi thử lại.');
    this.nativeCooldown.set(origin, this.now() + 30000);
    const requestId = randomUUID();
    const pending: NativePending = { origin, secret: randomBytes(32).toString('hex'), expires: this.now() + 300000, state: 'pending' };
    this.nativePending.set(requestId, pending);
    // Never issue a session from a late dialog after cancellation/expiry.
    void Promise.resolve().then(() => approve(origin)).then(approved => {
      if (this.nativePending.get(requestId) === pending && pending.expires > this.now()) pending.state = approved ? 'approved' : 'denied';
    }).catch(() => { if (this.nativePending.get(requestId) === pending) pending.state = 'denied'; });
    return { requestId, claimSecret: pending.secret, expiresAt: pending.expires };
  }
  private nativeRequest(origin: string, id: string, secret: string) {
    const pending = this.nativePending.get(id);
    if (!pending || pending.origin !== origin || pending.expires <= this.now() || !/^[0-9a-f]{64}$/.test(secret) || !timingSafeEqual(Buffer.from(pending.secret), Buffer.from(secret))) throw new Error('Yêu cầu ghép nối không hợp lệ hoặc đã hết hạn.');
    return pending;
  }
  pollNative(origin: string, id: string, secret: string) {
    const pending = this.nativeRequest(origin, id, secret);
    if (pending.state === 'pending') return { state: 'pending' as const };
    this.nativePending.delete(id);
    if (pending.state === 'denied') return { state: 'denied' as const };
    return { state: 'approved' as const, ...this.issue(origin) };
  }
  cancelNative(origin: string, id: string, secret: string) {
    this.nativeRequest(origin, id, secret); this.nativePending.delete(id);
  }
  valid(origin: string, token: string) {
    const session = this.sessions.get(token);
    return !!session && session.origin === origin && session.expires > this.now();
  }
  revoke(token: string) { this.sessions.delete(token); }
}
