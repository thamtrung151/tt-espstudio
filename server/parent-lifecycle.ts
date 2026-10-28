import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';

// Only the launcher's inherited pipe can request exit; never an HTTP endpoint.
export function attachParentLifecycle(input: Readable, hooks: {
  isBusy: () => boolean; drain: () => void; stop: () => void; reportBusy: () => void;
}) {
  const lines = createInterface({ input });
  let stopped = false;
  let waiting: ReturnType<typeof setInterval> | undefined;
  const finishIfIdle = () => {
    if (stopped || hooks.isBusy()) return;
    stopped = true;
    if (waiting) clearInterval(waiting);
    hooks.drain(); hooks.stop(); lines.close();
  };
  lines.on('line', line => {
    if (line !== 'shutdown' || stopped) return;
    if (hooks.isBusy()) { hooks.reportBusy(); return; }
    finishIfIdle();
  });
  lines.on('close', () => {
    if (stopped) return;
    hooks.drain();
    finishIfIdle();
    if (!stopped) waiting = setInterval(finishIfIdle, 250);
  });
}
