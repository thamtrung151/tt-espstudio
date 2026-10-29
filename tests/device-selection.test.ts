import { describe, it, expect } from 'vitest';
import { matchingPorts, portLabel } from '../src/ui/device-port';
const info={usbVendorId:0x10c4,usbProductId:0xea60};
describe('browser USB identity to Agent port matching',()=>{
  it('matches both VID and PID, never a Bluetooth or unrelated port',()=>{
    const port={port:'COM6',description:'Silicon Labs (COM6)',hwid:'USB VID:PID=10C4:EA60 SER=one LOCATION=1'};
    expect(matchingPorts(info,[{port:'COM11',hwid:'BTHENUM'},port,{port:'COM8',hwid:'USB VID:PID=10C4:0001'}])).toEqual([port]);
    expect(portLabel(port)).toBe('COM6 (Silicon Labs)');
  });
  it('accepts Windows VID/PID notation and handles absent metadata without guessing',()=>{
    expect(matchingPorts(info,[{port:'COM2',hwid:'USB\\VID_10c4&PID_ea60'}])).toHaveLength(1);
    expect(matchingPorts({},[{port:'COM6'}])).toEqual([]);
    expect(matchingPorts(info,[{port:'COM6'}])).toEqual([]);
  });
  it('returns every matching device so duplicate adapters are never silently assigned',()=>{
    expect(matchingPorts(info,[{port:'COM6',hwid:'VID:PID=10C4:EA60 SER=one'},{port:'COM7',hwid:'VID:PID=10C4:EA60 SER=two'}])).toHaveLength(2);
  });
});
