import { describe, it, expect } from 'vitest';
import { allocatePwm, configWarnings, emptyBoard, parseConfig, platformioIni, template, targets } from '../src/core/config';

describe('ESP32-S2 and ESP32-C3 build profiles', () => {
  it('preserves legacy profiles and explicitly selects USB CDC or UART', () => {
    for (const target of Object.keys(targets) as (keyof typeof targets)[]) {
      const config = emptyBoard(target);
      expect(platformioIni(config)).not.toContain('build_flags');
      config.board.serialTransport = 'uart';
      expect(platformioIni(config)).toContain('ARDUINO_USB_CDC_ON_BOOT=0');
      config.board.serialTransport = 'usb-cdc';
      if (target === 'esp32') expect(() => parseConfig(config)).toThrow('USB native');
      else {
        expect(parseConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
        expect(platformioIni(config)).toContain('ARDUINO_USB_CDC_ON_BOOT=1');
        expect(platformioIni(config)).toContain(`-DARDUINO_USB_MODE=${target === 'esp32s2' ? 0 : 1}\n`);
      }
    }
  });
  it('makes manual reset explicit without weakening GPIO freedom', () => {
    const config = emptyBoard('esp32s2'); config.board.serialTransport = 'usb-cdc';
    config.board.exposedPins = []; config.board.uploadReset = 'manual';
    expect(platformioIni(config)).toContain('board_upload.after_reset = no_reset');
    config.board.uploadReset = 'auto'; expect(platformioIni(config)).not.toContain('after_reset');
  });
  for (const target of ['esp32s2', 'esp32c3'] as const) {
    it(`${target}: round-trips config, exports its board and preserves user GPIOs`, () => {
      const config = emptyBoard(target);
      config.board.exposedPins = [255];
      config.devices = [{ id: 'led', label: 'User GPIO', driver: 'gpio.output', pin: 255, activeLow: false }];
      expect(parseConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
      expect(platformioIni(config)).toContain(`board = ${targets[target].board}`);
      expect(template(target).board.name).toContain(target === 'esp32s2' ? 'ESP32-S2' : 'ESP32-C3');
      expect(configWarnings(config).join('\n')).toContain('GPIO255');
    });
    it(`${target}: allocates every available channel and rejects over-allocation`, () => {
      const config = emptyBoard(target);
      config.devices = Array.from({ length: targets[target].pwmChannels }, (_, i) => ({ id: `p${i}`, label: `PWM ${i}`, driver: 'pwm.output' as const, pin: i, frequencyHz: 1000 }));
      expect(Object.values(allocatePwm(config))).toEqual(Array.from({ length: targets[target].pwmChannels }, (_, i) => i));
      config.devices.push({ id: 'overflow', label: 'Overflow', driver: 'pwm.output', pin: 200, frequencyHz: 1000 });
      expect(() => parseConfig(config)).toThrow('LEDC');
    });
  }
});
