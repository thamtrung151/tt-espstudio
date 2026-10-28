import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { attachParentLifecycle } from '../server/parent-lifecycle';

describe('packaged Agent lifetime', () => {
  function setup() {
    const pipe = new PassThrough(); let busy = false;
    const hooks = { isBusy: () => busy, drain: vi.fn(), stop: vi.fn(), reportBusy: vi.fn() };
    attachParentLifecycle(pipe, hooks);
    return { pipe, hooks, setBusy: (value: boolean) => { busy = value; } };
  }
  it('exits on parent EOF when idle, preventing an orphan listener', async () => {
    const { pipe, hooks } = setup(); pipe.end();
    await new Promise(resolve => setImmediate(resolve));
    expect(hooks.drain).toHaveBeenCalled(); expect(hooks.stop).toHaveBeenCalledTimes(1);
  });
  it('refuses normal quit during a job and still accepts quit after completion', () => {
    const { pipe, hooks, setBusy } = setup(); setBusy(true);
    pipe.write('shutdown\n');
    expect(hooks.reportBusy).toHaveBeenCalledOnce(); expect(hooks.drain).not.toHaveBeenCalled(); expect(hooks.stop).not.toHaveBeenCalled();
    setBusy(false); pipe.write('shutdown\n'); expect(hooks.stop).toHaveBeenCalledOnce(); pipe.destroy();
  });
  it('parent death rejects new work but lets an active flash finish before exit', async () => {
    vi.useFakeTimers({ toFake: ['setInterval','clearInterval'] });
    try {
      const { pipe, hooks, setBusy } = setup(); setBusy(true); pipe.end();
      await new Promise(resolve => setImmediate(resolve));
      expect(hooks.drain).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(10000); expect(hooks.stop).not.toHaveBeenCalled();
      setBusy(false); vi.advanceTimersByTime(250); expect(hooks.stop).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(1000); expect(hooks.stop).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});
