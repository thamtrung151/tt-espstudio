import { type Device, type Driver, driverLabels } from './core/config';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function createDeviceRow(driver: Driver, id: string, device?: Device): HTMLElement {
  const row = document.createElement('div'); row.className = 'device-row'; row.dataset.driver = driver;
  const value = device as unknown as Record<string, unknown> | undefined;
  const number = (key: string, label: string, min: number, max: number, fallback?: number) => `<label>${label}<input type="number" class="d-${key}" data-field="${key}" value="${escape(value?.[key] ?? fallback ?? '')}" min="${min}" max="${max}" required ${['pin','in1','in2'].includes(key) ? 'data-pin="true" list="gpio-options"' : ''}></label>`;
  const check = (key: string, label: string) => `<label class="checkbox"><input type="checkbox" data-field="${key}" ${value?.[key] ? 'checked' : ''}> ${label}</label>`;
  const select = (key: string, label: string, values: [string,string][], fallback: string) => `<label>${label}<select data-field="${key}">${values.map(([v,label]) => `<option value="${v}" ${String(value?.[key] ?? fallback) === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  let options = driver === 'motor.hbridge2' ? number('in1','GPIO IN1',0,255) + number('in2','GPIO IN2',0,255) : number('pin','GPIO',0,255);
  if (driver === 'gpio.output' || driver === 'gpio.input') options += check('activeLow','Active-low (LOW = đang bật/được nhấn)');
  if (driver === 'gpio.input') options += select('pull','Điện trở kéo', [['none','None / điện trở ngoài'],['up','Pull-up nội'],['down','Pull-down nội']], 'none');
  if (driver === 'adc.input') options += select('attenuation','Suy hao ADC', [['0','0 dB'],['2.5','2.5 dB'],['6','6 dB'],['11','11 dB']], '11');
  if (driver === 'pwm.output' || driver === 'motor.hbridge2') options += number('frequencyHz','Tần số PWM (Hz)',1,20000,driver === 'pwm.output' ? 1000 : 20000);
  if (driver === 'servo.pwm') options += number('minUs','Xung tại 0° (µs)',500,2500,1000) + number('maxUs','Xung tại 180° (µs)',500,2500,2000);
  if (driver === 'motor.hbridge2') options += check('reversed','Đảo chiều motor');
  row.innerHTML = `<div class="device-row-title"><strong>${driverLabels[driver]}</strong><button type="button" class="remove-device quiet" aria-label="Xóa thiết bị">✕</button></div><div class="row-fields"><label>Tên hiển thị<input class="d-label" value="${escape(device?.label ?? driverLabels[driver])}" required maxlength="80"></label><label>Định danh<input class="d-id" value="${escape(device?.id ?? id)}" required></label></div><div class="driver-options">${options}</div>`;
  row.querySelector<HTMLButtonElement>('.remove-device')!.onclick = () => row.remove(); return row;
}
export function readDeviceRow(row: HTMLElement): unknown {
  const data: Record<string, unknown> = { id: row.querySelector<HTMLInputElement>('.d-id')!.value, label: row.querySelector<HTMLInputElement>('.d-label')!.value, driver: row.dataset.driver };
  row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]').forEach(field => {
    data[field.dataset.field!] = field instanceof HTMLInputElement && field.type === 'checkbox' ? field.checked : field instanceof HTMLInputElement && field.type === 'number' ? (field.value.trim() ? Number(field.value) : NaN) : field.value;
  });
  return data;
}
