import { z } from 'zod';

export const targets = {
  esp32: { label: 'ESP32 / WROOM', board: 'esp32dev', pins: [0,1,2,3,4,5,12,13,14,15,16,17,18,19,21,22,23,25,26,27,32,33,34,35,36,39], inputOnly: [34,35,36,39], noPull: [34,35,36,39], adc1: [32,33,34,35,36,39], adc2: [0,2,4,12,13,14,15,25,26,27], strapping: [0,2,5,12,15], serialPins: [1,3], pwmChannels: 16 },
  esp32s3: { label: 'ESP32-S3', board: 'esp32-s3-devkitc-1', pins: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,38,39,40,41,42,43,44,45,46,47,48], inputOnly: [46], noPull: [46], adc1: [1,2,3,4,5,6,7,8,9,10], adc2: [11,12,13,14,15,16,17,18,19,20], strapping: [0,3,45,46], serialPins: [43,44], pwmChannels: 8 },
} as const;
const has = (values: readonly number[], pin: number) => values.includes(pin);
// Numeric representation only, NOT a chip/board whitelist. The board owner
// chooses GPIOs; target metadata below supplies advisory notes, never a gate.
const pin = z.number().int().min(0).max(255);
const base = { id: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, 'Định danh: chữ thường, số, gạch dưới; bắt đầu bằng chữ.'), label: z.string().trim().min(1).max(80) };
const frequency = z.number().int().min(1).max(20000);
export const deviceSchema = z.discriminatedUnion('driver', [
  z.object({ ...base, driver: z.literal('gpio.output'), pin, activeLow: z.boolean() }).strict(),
  z.object({ ...base, driver: z.literal('gpio.input'), pin, activeLow: z.boolean(), pull: z.enum(['none','up','down']) }).strict(),
  z.object({ ...base, driver: z.literal('adc.input'), pin, attenuation: z.enum(['0','2.5','6','11']) }).strict(),
  z.object({ ...base, driver: z.literal('pwm.output'), pin, frequencyHz: frequency }).strict(),
  z.object({ ...base, driver: z.literal('servo.pwm'), pin, minUs: z.number().int().min(500).max(2500), maxUs: z.number().int().min(500).max(2500) }).strict(),
  z.object({ ...base, driver: z.literal('motor.hbridge2'), in1: pin, in2: pin, frequencyHz: frequency, reversed: z.boolean() }).strict(),
]);
export type Device = z.infer<typeof deviceSchema>;
export type Driver = Device['driver'];
export const driverLabels: Record<Driver, string> = { 'gpio.output': 'GPIO output', 'gpio.input': 'GPIO input', 'adc.input': 'ADC input', 'pwm.output': 'PWM output', 'servo.pwm': 'Servo PWM', 'motor.hbridge2': 'Motor 2 PWM · IN1 / IN2' };
export function devicePins(d: Device): { field: string; pin: number }[] { return d.driver === 'motor.hbridge2' ? [{ field: 'in1', pin: d.in1 }, { field: 'in2', pin: d.in2 }] : [{ field: 'pin', pin: d.pin }]; }
export function pwmSpec(d: Device): { frequency: number; bits: number } | null {
  if (d.driver === 'servo.pwm') return { frequency: 50, bits: 14 };
  if (d.driver === 'pwm.output' || d.driver === 'motor.hbridge2') return { frequency: d.frequencyHz, bits: 8 };
  return null;
}
// Core 2.x adjacent channels share a timer. Group only identical freq/resolution.
export function allocatePwm(config: { board: { target: keyof typeof targets }; devices: Device[] }): Record<string, number> {
  const pairs: { key: string; used: number }[] = []; const result: Record<string, number> = {};
  for (const d of config.devices) {
    const spec = pwmSpec(d); if (!spec) continue;
    const key = `${spec.frequency}:${spec.bits}`;
    const outputs = d.driver === 'motor.hbridge2' ? [d.id + ':in1', d.id + ':in2'] : [d.id];
    for (const output of outputs) {
      let pair = pairs.findIndex(p => p.key === key && p.used < 2);
      if (pair < 0) { pair = pairs.length; pairs.push({ key, used: 0 }); }
      if (pair * 2 >= targets[config.board.target].pwmChannels) throw new Error('Hết timer/kênh LEDC. Giảm số PWM/servo hoặc dùng chung tần số PWM.');
      result[output] = pair * 2 + pairs[pair].used++;
    }
  }
  return result;
}
export const configSchema = z.object({
  schemaVersion: z.literal(1),
  board: z.object({ name: z.string().trim().min(1).max(80), target: z.enum(['esp32','esp32s3']), exposedPins: z.array(pin).max(256) }).strict(),
  devices: z.array(deviceSchema).max(32),
}).strict().superRefine((config, ctx) => {
  const exposed = new Set<number>();
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  config.board.exposedPins.forEach((p, i) => {
    if (exposed.has(p)) issue(['board','exposedPins',i], `GPIO${p}: bị lặp trong danh sách.`);
    exposed.add(p);
  });
  const ids = new Set<string>();
  config.devices.forEach((d, i) => {
    if (ids.has(d.id)) issue(['devices',i,'id'], 'Tên thiết bị bị trùng.'); ids.add(d.id);
    if (d.driver === 'servo.pwm' && d.minUs >= d.maxUs) issue(['devices',i,'maxUs'], 'Xung tối đa phải lớn hơn xung tối thiểu.');
  });
  try { allocatePwm(config); } catch (error) { issue(['devices'], String((error as Error).message)); }
});
export type Config = z.infer<typeof configSchema>;
export function configWarnings(config: Config): string[] {
  const target = targets[config.board.target]; const warnings: string[] = []; const used = new Map<number, string>();
  for (const d of config.devices) {
    for (const { pin } of devicePins(d)) {
      if (!has(target.pins, pin)) warnings.push(`${d.label} · GPIO${pin}: ngoài danh sách gợi ý của profile; kiểm tra sơ đồ board và kết nối flash/PSRAM nếu có. Studio vẫn dùng đúng chân bạn đã chọn.`);
      if (!config.board.exposedPins.includes(pin)) warnings.push(`${d.label} · GPIO${pin}: chưa liệt kê trong danh sách gợi ý của board; vẫn được sử dụng.`);
      if (used.has(pin)) warnings.push(`GPIO${pin}: được dùng chung bởi ${used.get(pin)} và ${d.label}. Kiểm tra việc điều khiển chung chân.`); used.set(pin, d.label);
      if (has(target.serialPins, pin)) warnings.push(`${d.label} · GPIO${pin}: thường dùng cho Serial UART0; firmware hiện gọi Serial.begin().`);
      if (!['gpio.input','adc.input'].includes(d.driver) && has(target.inputOnly, pin)) warnings.push(`${d.label} · GPIO${pin}: tài liệu target ghi là input-only. Chọn output trong Studio không tạo khả năng output trên phần cứng.`);
      if (has(target.strapping, pin)) warnings.push(`${d.label} · GPIO${pin}: chân strapping; mức điện lúc reset/nạp ảnh hưởng khởi động. Có thể sử dụng sau khi khởi động.`);
      if (config.board.target === 'esp32' && pin === 12) warnings.push('GPIO12: kéo HIGH lúc reset có thể chọn sai điện áp flash.');
      if (config.board.target === 'esp32' && [16,17].includes(pin)) warnings.push(`GPIO${pin}: hợp lệ cho WROOM; module có PSRAM như WROVER có thể chiếm chân này.`);
      if (config.board.target === 'esp32s3' && [19,20].includes(pin)) warnings.push(`GPIO${pin}: dùng chung USB native; kiểm tra cổng USB đang dùng.`);
    }
    if (d.driver === 'gpio.input' && d.pull !== 'none' && has(target.noPull, d.pin)) warnings.push(`${d.label} · GPIO${d.pin}: tài liệu target không hỗ trợ pull nội; kiểm tra điện trở ngoài.`);
    if (d.driver === 'adc.input' && !has(target.adc1, d.pin) && !has(target.adc2, d.pin)) warnings.push(`${d.label} · GPIO${d.pin}: chưa có trong bảng ADC tham khảo của target; kiểm tra chức năng ADC thực tế.`);
    if (d.driver === 'adc.input' && has(target.adc2, d.pin)) warnings.push(`${d.label}: ADC2 dùng chung tài nguyên với Wi-Fi; ưu tiên ADC1 khi cần Wi-Fi.`);
    if (d.driver === 'servo.pwm') warnings.push(`${d.label}: nguồn servo riêng phù hợp, chung GND; kiểm tra dải xung trước khi gắn tải.`);
    if (d.driver === 'motor.hbridge2') warnings.push(`${d.label}: cần driver cầu H có đầu IN1/IN2 (hai PWM); GPIO không cấp điện trực tiếp cho motor. STBY/EN nếu có phải đấu riêng theo IC.`);
  }
  return [...new Set(warnings)];
}
export function template(target: keyof typeof targets = 'esp32'): Config & { devices: Extract<Device, { driver: 'gpio.output' }>[] } {
  return { schemaVersion: 1, board: { name: target === 'esp32' ? 'ESP32 DevKit · Bàn thực hành' : 'ESP32-S3 · Board mẫu', target, exposedPins: [...targets[target].pins] }, devices: [{ id: 'status_led', label: 'LED ngoài', driver: 'gpio.output', pin: target === 'esp32' ? 23 : 4, activeLow: false }] };
}
export function emptyBoard(target: keyof typeof targets = 'esp32'): Config { return { ...template(target), board: { ...template(target).board, name: 'Board của tôi' }, devices: [] }; }
export function parseConfig(value: unknown): Config { return configSchema.parse(value); }
export function describeError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.map(i => `${i.path.join('.') || 'Dữ liệu'}: ${i.message}`).join('\n');
  return error instanceof Error ? error.message : String(error);
}
export function platformioIni(config: Config): string {
  const valid = parseConfig(config);
  return `[env:robot]\nplatform = espressif32@6.12.0\nboard = ${targets[valid.board.target].board}\nframework = arduino\nmonitor_speed = 115200\n`;
}
