export type UsbIdentity = { usbVendorId?: number; usbProductId?: number };
export type AgentPort = { port: string; description?: string; hwid?: string };

export function matchingPorts(info: UsbIdentity, ports: AgentPort[]): AgentPort[] {
  if (!Number.isInteger(info.usbVendorId) || !Number.isInteger(info.usbProductId)) return [];
  return ports.filter(port => {
    const id = port.hwid?.match(/VID:PID=([0-9a-f]{4}):([0-9a-f]{4})/i)
      ?? port.hwid?.match(/VID_([0-9a-f]{4})&PID_([0-9a-f]{4})/i);
    return !!id && parseInt(id[1], 16) === info.usbVendorId && parseInt(id[2], 16) === info.usbProductId;
  });
}

export function portLabel(port: AgentPort): string {
  const description = port.description?.replace(/\s*\(COM\d+\)\s*$/i, '').trim();
  return description ? `${port.port} (${description})` : port.port;
}
