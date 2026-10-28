import { describe, it, expect, vi } from 'vitest';
import { BuildService, buildRequest, uploadDiagnostic } from '../server/service';
import { template } from '../src/core/config';
describe('local build boundary', () => {
  it('does not treat writing 100% or an earlier verified segment as a successful flash', () => {
    const error = "Cannot configure port: A device which does not exist was specified";
    expect(uploadDiagnostic('Writing at 0x10000 (100 %)\n' + error)).toContain('chưa xác nhận nạp hoàn tất');
    expect(uploadDiagnostic('Hash of data verified.\nWriting at 0x10000 (91 %)\n' + error)).toContain('chưa xác nhận nạp hoàn tất');
    expect(uploadDiagnostic('Hash of data verified.\nLeaving...\nHard resetting via RTS pin...\n' + error)).toContain('bước kết thúc/reset');
    expect(uploadDiagnostic('Compilation failed')).toBeUndefined();
  });
  it('rejects request-controlled command arguments and empty programs', () => {
    expect(() => buildRequest.parse({ config: template(), code: 'x', command: 'bad' })).toThrow();
    expect(() => buildRequest.parse({ config: template(), code: '' })).toThrow();
  });
  it('validates before writing or starting a toolchain', async () => {
    const service = new BuildService('unused');
    await expect(service.build({ config: { bad: true }, code: 'test' })).rejects.toThrow();
    expect(service.jobs.size).toBe(0); expect(service.busy).toBe(false);
  });
  it('requires a successful build and serializes operations', async () => {
    const service = new BuildService('unused');
    await expect(service.upload('unknown', 'COM1')).rejects.toThrow('build thành công');
    service.busy = true;
    await expect(service.build({ config: template(), code: 'x' })).rejects.toThrow('đang chạy');
  });
});
