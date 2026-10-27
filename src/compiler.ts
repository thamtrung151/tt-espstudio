export const COMPILER_API_VERSION = 1;
export type CompilerSession = { apiVersion?: number; version: string; token?: string; setup?: 'ready' | 'required' };
export interface CompilerService {
  readonly isAgent: boolean;
  token: string;
  request<T = any>(path: string, body?: unknown): Promise<T>;
  connect(): Promise<CompilerSession>;
  requestPairing(): Promise<{ requestId: string }>;
  pair(requestId: string, code: string): Promise<void>;
  disconnect(): Promise<void>;
}
export class HttpCompilerService implements CompilerService {
  token = '';
  constructor(readonly isAgent: boolean) {
    if (isAgent) { try { this.token = sessionStorage.getItem('tt-espstudio.agent-session.v1') ?? ''; } catch { /* memory-only session */ } }
  }
  async request<T = any>(path: string, body?: unknown): Promise<T> {
    const base = this.isAgent ? 'http://127.0.0.1:3217/api/' : '/api/';
    let response: Response;
    try {
      response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', 'X-Studio-Token': this.token }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new Error(this.isAgent ? 'Không kết nối được Agent. Hãy mở Agent, kiểm tra đúng website được phép và quyền truy cập mạng cục bộ/loopback trong cài đặt website của Chrome/Edge.' : 'Không kết nối được compiler local. Hãy kiểm tra launcher.');
    }
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) this.saveToken('');
      throw new Error(data.error ?? `HTTP ${response.status}`);
    }
    return data as T;
  }
  async connect() {
    if (this.isAgent) {
      const health = await this.request<CompilerSession>('health');
      if (health.apiVersion !== COMPILER_API_VERSION) throw new Error('Web và Agent không tương thích. Cần cập nhật Agent.');
      if (!this.token) throw new Error('Agent đã chạy. Hãy ghép nối website bằng mã hiển thị trên Agent.');
    }
    const session = await this.request<CompilerSession>('session');
    if (session.apiVersion !== COMPILER_API_VERSION && !(session.apiVersion === undefined && !this.isAgent && session.version === '0.2.1')) throw new Error('API compiler không tương thích. Khởi động lại hoặc cập nhật Agent.');
    if (!this.isAgent && session.token) this.token = session.token;
    if (session.setup === 'required') throw new Error('Agent đã ghép nối nhưng chưa cài xong toolchain. Hoàn tất thiết lập Agent trước khi build.');
    return session;
  }
  requestPairing() { return this.request<{ requestId: string }>('pair/request', {}); }
  async pair(requestId: string, code: string) {
    const session = await this.request<{ token: string; apiVersion: number }>('pair/confirm', { requestId, code });
    if (session.apiVersion !== COMPILER_API_VERSION) throw new Error('API Agent không tương thích.');
    this.saveToken(session.token);
  }
  private saveToken(token: string) { this.token = token; try { if (token) sessionStorage.setItem('tt-espstudio.agent-session.v1', token); else sessionStorage.removeItem('tt-espstudio.agent-session.v1'); } catch { /* memory-only session */ } }
  async disconnect() { try { if (this.token && this.isAgent) await this.request('unpair', {}); } finally { this.saveToken(''); } }
}
export const compiler: CompilerService = new HttpCompilerService(import.meta.env.VITE_COMPILER_MODE === 'agent');
