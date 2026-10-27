import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

export const AGENT_API_VERSION = 1;
export const AGENT_VERSION = '0.3.0-preview.1';
type Pending = { id: string; code: string; expires: number; attempts: number };
export class AgentAuth {
  private pending = new Map<string, Pending>();
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
    for (const [key, session] of this.sessions) if (session.expires <= this.now()) this.sessions.delete(key);
    if (this.sessions.size >= 32) throw new Error('Quá nhiều phiên. Khởi động lại Agent để thu hồi các phiên.');
    const token = randomBytes(32).toString('hex'); const expiresAt = this.now() + 8 * 60 * 60 * 1000;
    this.sessions.set(token, { origin, expires: expiresAt });
    return { token, expiresAt, apiVersion: AGENT_API_VERSION };
  }
  valid(origin: string, token: string) {
    const session = this.sessions.get(token);
    return !!session && session.origin === origin && session.expires > this.now();
  }
  revoke(token: string) { this.sessions.delete(token); }
}
