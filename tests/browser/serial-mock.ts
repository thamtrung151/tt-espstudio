import type { Page } from '@playwright/test';
export async function mockSerial(page: Page) {
  await page.addInitScript(() => {
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const state = { picks: 0, opens: 0, closes: 0, sent: '', cancel: false, pid: 0xea60,
      emit: (text:string) => controller.enqueue(new TextEncoder().encode(text)) };
    (window as any).__serialTest = state;
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {
      requestPort: async () => {
        state.picks++;
        if (state.cancel) throw new DOMException('Cancelled', 'NotFoundError');
        const pid = state.pid;
        const port: any = { readable: null, writable: null, getInfo: () => ({ usbVendorId: 0x10c4, usbProductId: pid }),
          open: async () => { state.opens++; port.readable = new ReadableStream<Uint8Array>({start(c){controller=c}}); port.writable = new WritableStream<Uint8Array>({write(data){state.sent+=new TextDecoder().decode(data)}}); },
          close: async () => { state.closes++; port.readable=null;port.writable=null; } };
        return port;
      },
    } });
  });
}
