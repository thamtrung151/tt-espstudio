import './ui/ide.css';
import { shell } from './ui/shell';
import { initIde } from './ui/ide';
import { SerialMonitor } from './ui/serial';
import { matchingPorts, portLabel, portUsbIdentity, type AgentPort } from './ui/device-port';
import { t, initLocale } from './ui/i18n';
import { compiler } from './compiler';
import { zipSync, strToU8 } from 'fflate';
import { Blockly, initialWorkspace, toolbox, readProgram, setDevices, validateWorkspace, deviceBlocks } from './blocks';
import { describeError, parseConfig, platformioIni, targets, template, type Config, type Driver, driverLabels, configWarnings, allocatePwm } from './core/config';
import { createDeviceRow, readDeviceRow } from './config-form';
import { example } from './examples';
import { generate, projectSchema, returnToBlocks, type Generated, type Project } from './core/program';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const storageKey = 'tt-espstudio.project.v1';
let project: Project = { schemaVersion: 1, name: 'Hello, ESP32', config: template(), mode: 'blocks', workspace: initialWorkspace, code: '', codeHistory: [] };
let startupError = ''; let damagedSave = ''; let storageLocked = false;
try {
  const raw = localStorage.getItem(storageKey);
  if (raw) { damagedSave = raw; const candidate = projectSchema.parse(JSON.parse(raw)); validateWorkspace(candidate.workspace, candidate.config); project = candidate; damagedSave = ''; }
} catch (error) { startupError = `Không thể phục hồi bản lưu. Bản gốc được giữ lại; hãy tải bản cứu hộ trước khi lưu tiếp. ${describeError(error)}`; storageLocked = true; }
setDevices(project.config.devices);
document.querySelector('#app')!.innerHTML = shell();
const codeArea = $<HTMLTextAreaElement>('code');
let ide: ReturnType<typeof initIde> | undefined;
let serialMonitor: SerialMonitor | undefined;
let uploadPort: AgentPort | null = null;
let mappingInvalid = false;
let connectingCompiler = false;
let phase: 'building' | 'confirmation' | 'uploading' | null = null;
// Keep the selector aligned with the schema/build profiles for every chip family.
$<HTMLSelectElement>('config-target').replaceChildren(...Object.entries(targets).map(([id, target]) => new Option(target.label, id)));
const connectButton = document.createElement('button'); connectButton.id = 'agent-connect'; connectButton.textContent = 'Kết nối compiler'; connectButton.className = 'quiet';
$('bridge-state').after(connectButton);
const agentPanel = document.createElement('div'); agentPanel.className = 'card'; agentPanel.id = 'agent-panel'; agentPanel.hidden = !compiler.isAgent;
agentPanel.innerHTML = `<h3>TT ESPStudio Agent · bản thử nghiệm</h3><p>Website giữ trình soạn thảo. Build và nạp chạy trên máy Windows của bạn qua Agent. Chưa có bộ cài người dùng cuối trong bản preview này.</p><p id="agent-help">Mở Agent trên máy, cho phép trình duyệt truy cập loopback nếu được hỏi, rồi kết nối. Mã ghép nối chỉ xuất hiện trên Agent.</p><form id="agent-pair-form" hidden><label>Mã 8 chữ số trên Agent<input id="agent-pair-code" inputmode="numeric" autocomplete="off" pattern="[0-9]{8}" maxlength="8" required></label><button type="submit">Xác nhận ghép nối</button></form><button id="agent-unpair" class="quiet">Ngắt ghép nối</button><p id="agent-message" role="status"></p>`;
$('device-view').prepend(agentPanel);
$('agent-help').textContent = 'Bấm Kết nối Compiler và xác nhận trên cửa sổ Agent nếu được hỏi.';
agentPanel.querySelector('p')!.textContent = 'ESPStudio Agent giúp biên dịch và nạp chương trình từ website lên board của bạn. Cài Agent và mở ứng dụng trước khi kết nối.';
const launchAgent = document.createElement('a'); launchAgent.href = 'ttespstudio://connect'; launchAgent.textContent = 'Mở Agent và kết nối'; launchAgent.hidden = true; launchAgent.className = 'quiet';
// Protocol activation is initiated only by an explicit Compiler click.
launchAgent.title = 'Dành cho bộ cài có đăng ký liên kết TT ESPStudio. Bản Agent Dev vẫn mở bằng launcher .cmd.';
$('agent-help').after(launchAgent);
const cancelButton = document.createElement('button'); cancelButton.id = 'cancel-build'; cancelButton.textContent = 'Hủy biên dịch'; cancelButton.hidden = true;
$('clear-log').before(cancelButton);
let activeJob: string | null = null;
let pairingRequest = '';
connectButton.onclick = () => void connectCompiler();
async function connectCompiler() {
  if (connectingCompiler || busy) return;
  connectingCompiler = true; launchAgent.hidden = true; syncButtons();
  let reachable = false;
  try {
    if (compiler.isAgent) {
      try { await compiler.request('health'); reachable = true; }
      catch {
        notify('Đang mở Agent. Cho phép trình duyệt mở ứng dụng nếu được hỏi.');
        launchAgent.click();
        const deadline=Date.now()+25000;
        while(Date.now()<deadline){
          await new Promise(resolve=>setTimeout(resolve,700));
          try { await compiler.request('health');reachable=true;break; } catch { /* startup or browser permission pending */ }
        }
        if(!reachable)throw new Error('Chưa kết nối được Agent. Cho phép mở TT ESPStudio Agent và truy cập mạng cục bộ trong trình duyệt, rồi bấm Compiler để thử lại.');
      }
    }
    try { await compiler.connect(); await connectBridge(); if(token)notify('Compiler đã kết nối.'); return; }
    catch (error) { if (!compiler.isAgent || compiler.token) throw error; }
    const request = await compiler.requestPairing(); pairingRequest = request.requestId;
    if (request.claimSecret) {
      $('agent-pair-form').hidden = true;
      $('agent-message').textContent = 'Kiểm tra địa chỉ website và chọn Có trên cửa sổ TT ESPStudio Agent. Không cần nhập mã.';
      notify('Chọn Có trên cửa sổ Agent để kết nối Compiler.');
      await compiler.finishNativePairing(request); await connectBridge(); if(token)notify('Compiler đã kết nối.'); return;
    }
    ide?.showDialog('settings-dialog');
    $('agent-pair-form').hidden = false; $('agent-message').textContent = 'Kiểm tra đúng địa chỉ website trên cửa sổ Agent rồi nhập mã tại đây.';
    $<HTMLInputElement>('agent-pair-code').focus();
  } catch (error) {
    $('agent-message').textContent = describeError(error);notify(describeError(error),true);
    // Show the launch fallback only when the Agent cannot be reached, not after denial.
    launchAgent.hidden = !compiler.isAgent || reachable;
  } finally { connectingCompiler = false; syncButtons(); }
}
$('agent-pair-form').onsubmit = async event => {
  event.preventDefault();
  try { await compiler.pair(pairingRequest, $<HTMLInputElement>('agent-pair-code').value); $<HTMLInputElement>('agent-pair-code').value = ''; $('agent-pair-form').hidden = true; await connectBridge(); }
  catch (error) { $('agent-message').textContent = describeError(error); }
};
$('agent-unpair').onclick = async () => {
  if (busy) return notify('Chờ tác vụ hiện tại kết thúc trước khi ngắt ghép nối.', true);
  try { await compiler.disconnect(); } catch { /* local session is cleared even offline */ }
  token = ''; lastBuild = null; notify('Đã ngắt kết nối Compiler.'); $('bridge-state').textContent = 'Agent chưa ghép nối'; $('agent-message').textContent = 'Đã xóa phiên ghép nối trên web.'; syncButtons();
};
cancelButton.onclick = async () => { try { if (activeJob) await compiler.request('cancel', { jobId: activeJob }); } catch (error) { notify(describeError(error), true); } };
const codeHighlight = document.createElement('div');
codeHighlight.id = 'code-highlight'; codeHighlight.hidden = true; codeHighlight.setAttribute('aria-hidden', 'true');
codeArea.before(codeHighlight);
let selectedRange: { start: number; end: number } | undefined;
function paintCodeRange() {
  codeHighlight.hidden = !selectedRange || project.mode !== 'blocks' || !!generationError;
  if (!selectedRange) return;
  const style = getComputedStyle(codeArea); const lineHeight = parseFloat(style.lineHeight);
  codeHighlight.style.top = `${parseFloat(style.paddingTop) + (selectedRange.start - 1) * lineHeight - codeArea.scrollTop}px`;
  codeHighlight.style.height = `${(selectedRange.end - selectedRange.start + 1) * lineHeight}px`;
  codeHighlight.style.width = `${codeArea.clientWidth}px`;
}
codeArea.addEventListener('scroll', paintCodeRange);
new ResizeObserver(paintCodeRange).observe(codeArea);
const workspace = Blockly.inject('blockly', { toolbox, trashcan: true, grid: { spacing: 22, length: 1, colour: '#d7e1e2', snap: true }, zoom: { controls: false, wheel: false, startScale: 1.05, maxScale: 4, minScale: 0.4 }, move: { scrollbars: true, drag: true, wheel: false }, sounds: false });
let generated: Generated | null = null; let generationError = ''; let suppressEvents = true; let busy = false; let token = '';
let lastBuild: { id: string; fingerprint: string } | null = null;
let currentView = 'program';
let buildAction: 'build' | 'upload' = 'upload';
ide = initIde(workspace, codeArea, notify);
$('settings').onclick=()=>{if(token)$('agent-unpair').click();else void connectCompiler()};
let configPending = false;
const draftStatus = document.createElement('div'); draftStatus.className = 'info'; draftStatus.hidden = true;
draftStatus.innerHTML = 'Cấu hình đang là bản nháp, chưa dùng để biên dịch/nạp. Áp dụng cấu hình hoặc <button type="button" id="discard-config">Bỏ bản nháp</button>';
$('config-lock').after(draftStatus);
$('discard-config').onclick = () => { renderConfig(); notify('Đã bỏ bản nháp, khôi phục cấu hình đang dùng.'); };
function markConfigPending() { configPending = true; draftStatus.hidden = false; syncButtons(); }
$('config-form').addEventListener('input', markConfigPending);
$('config-form').addEventListener('change', markConfigPending);
$('config-form').addEventListener('click', event => { if ((event.target as Element).closest('.remove-device')) markConfigPending(); });
$('config-json').addEventListener('input', markConfigPending);
Blockly.serialization.workspaces.load(project.workspace, workspace); suppressEvents = false;
$<HTMLInputElement>('project-name').value = project.name;
function notify(message: string, error = false) {
  const notice=$('notice');notice.dataset.message=message;notice.hidden=false;notice.textContent=message;notice.className=error?'error':'info';
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)notice.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'ease-out'});
}
function snapshot() { project.workspace = Blockly.serialization.workspaces.save(workspace); }
function persist() {
  snapshot(); if (storageLocked) { $('save-state').textContent = 'Chưa lưu — cần cứu hộ'; return; }
  try { localStorage.setItem(storageKey, JSON.stringify(project)); $('save-state').textContent = '✓ Đã lưu trên máy'; }
  catch { $('save-state').textContent = 'Lưu thất bại'; notify('Bộ nhớ trình duyệt đã đầy hoặc không khả dụng. Hãy xuất file project để giữ dữ liệu.', true); }
}
function fingerprint() { return JSON.stringify({ config: project.config, code: project.code }); }
function syncButtons() {
  connectButton.hidden = !!token;
  connectButton.disabled = connectingCompiler || busy;
  connectButton.textContent = connectingCompiler ? 'Đang kết nối…' : 'Kết nối Compiler';
  $('agent-unpair').hidden = !token;
  $<HTMLButtonElement>('agent-unpair').disabled = connectingCompiler || busy;
  if (token) { launchAgent.hidden = true; $('agent-pair-form').hidden = true; }
  const configMode = project.mode === 'code';
  $<HTMLButtonElement>('build').disabled = busy || !!generationError || configPending;
  $<HTMLButtonElement>('upload').disabled = busy || !token || !!generationError || configPending || !lastBuild || lastBuild.fingerprint !== fingerprint() || !uploadPort;
  $('build-label').textContent = phase === 'confirmation' ? 'Chờ xác nhận trên Agent…' : phase === 'building' ? 'Đang biên dịch…' : phase === 'uploading' ? 'Đang nạp…' : buildAction === 'upload' ? 'Biên dịch và nạp' : 'Chỉ biên dịch';
  $('upload-consent-status').hidden = phase !== 'confirmation';
  $('settings').classList.toggle('connected', !!token);
  $('settings').title = connectingCompiler ? 'Đang kết nối Compiler…' : token ? 'Ngắt kết nối Compiler' : 'Kết nối Compiler';
  $<HTMLButtonElement>('settings').disabled=connectingCompiler||busy;
  $('settings').setAttribute('aria-busy',String(connectingCompiler));
  $('settings').setAttribute('aria-pressed',String(!!token));
  $('settings').setAttribute('data-connected', String(!!token));
  serialMonitor?.setLocked(phase === 'confirmation' || phase === 'uploading');
  $('build').setAttribute('data-agent-ready',String(!!token));
  $('blocks-mode').setAttribute('aria-pressed',String(!configMode)); $('code-mode').setAttribute('aria-pressed',String(configMode));
  ide?.setFocus(configMode ? 'code' : 'blocks', false);
  $('block-lock').hidden = !configMode; $('blockly').classList.toggle('locked', configMode); $('blockly').inert = configMode;
  codeArea.readOnly = !configMode;
  $('blocks-mode').classList.toggle('selected', !configMode); $('code-mode').classList.toggle('selected', configMode);
  $('code-badge').textContent = configMode ? 'C++ TỰ DO' : 'SINH TỪ BLOCKLY';
  $('mode-note').textContent = configMode ? 'Blockly được giữ như snapshot' : 'Block là nguồn chương trình';
  $('config-lock').hidden = !configMode;
  $('config-form').querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach(el => el.disabled = configMode);
  $<HTMLTextAreaElement>('config-json').disabled = configMode;
  $<HTMLButtonElement>('apply-json').disabled = configMode; $<HTMLButtonElement>('import-config').disabled = configMode;
  $('history-count').textContent = String(project.codeHistory.length);
  $('board-name').textContent = project.config.board.name;
  $('board-subtitle').textContent = `${targets[project.config.board.target].label} · ${project.config.devices.length} thiết bị · Arduino C++`;
  if (lastBuild && lastBuild.fingerprint !== fingerprint()) $('build-state').textContent = 'Chương trình đã thay đổi. Cần biên dịch lại trước khi nạp.';
}
function refreshCode() {
  const previousError = generationError;
  generationError = '';
  if (project.mode === 'blocks') {
    try { generated = generate(project.config, readProgram(workspace)); project.code = generated.code; }
    catch (error) { generationError = describeError(error); generated = null; notify(generationError, true); }
  }
  codeArea.value = project.code; ide?.renderCode(); syncButtons();
  if (previousError && !generationError && $('notice').dataset.message === previousError) $('notice').hidden = true;
  const selected = Blockly.getSelected();
  selectedRange = generated && selected ? generated.ranges[selected.id] : undefined;
  paintCodeRange();
  $('code-selection').textContent = generationError ? 'Blockly chưa hợp lệ · C++ đang giữ bản sinh thành công gần nhất' : selectedRange ? `Block → dòng ${selectedRange.start}–${selectedRange.end}` : 'Chọn block để xem đoạn C++ tương ứng';
}
function setView(view: string) {
  if (view === 'device') { ide?.showDialog('settings-dialog'); return; }
  if (view === 'guide') { ide?.showDialog('help-dialog'); return; }
  currentView = view;
  document.querySelectorAll<HTMLElement>('.view').forEach(el => el.hidden = el.id !== `${view}-view`);
  document.querySelectorAll<HTMLElement>('.nav').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  $('palette').hidden = view !== 'program'; $('config-summary').hidden = view !== 'config';
  workspace.getFlyout()?.hide();
  if (view === 'program') requestAnimationFrame(() => Blockly.svgResize(workspace));
}

document.querySelectorAll<HTMLElement>('[data-view]').forEach(el => el.onclick = () => setView(el.dataset.view!));
$('edit-board').onclick = () => setView('config');
workspace.addChangeListener(event => {
  if (event.type === Blockly.Events.SELECTED && project.mode === 'blocks' && generated) {
    const range = generated.ranges[(event as Blockly.Events.Selected).newElementId ?? ''];
    selectedRange = range;
    if (range) {
      const lines = project.code.split('\n'); const start = lines.slice(0, range.start - 1).reduce((n, line) => n + line.length + 1, 0);
      const end = start + lines.slice(range.start - 1, range.end).join('\n').length;
      // Keep focus in Blockly: stealing it here interrupts the active block drag.
      codeArea.setSelectionRange(start, end); codeArea.scrollTop = Math.max(0, (range.start - 5) * parseFloat(getComputedStyle(codeArea).lineHeight));
      $('code-selection').textContent = `Block → dòng ${range.start}–${range.end}`;
    }
    paintCodeRange();
  }
  if (suppressEvents || event.isUiEvent) return;
  if (project.mode === 'blocks') { refreshCode(); persist(); }
});
function enterCode() {
  if (project.mode === 'code') { ide?.setFocus('code'); return; }
  const hadError = !!generationError;
  snapshot(); project.mode = 'code'; generationError = ''; selectedRange = undefined;
  ide?.setFocus('code'); syncButtons(); paintCodeRange(); persist(); requestAnimationFrame(() => codeArea.focus());
  $('code-selection').textContent = 'Đang chỉnh sửa C++ tự do';
  if (hadError) notify('Blockly chưa hợp lệ. Bạn đang sửa bản C++ được giữ lại trên màn hình; bản này chưa phản ánh các thay đổi Blockly bị lỗi. Snapshot các block vẫn được giữ.');
}
function enterBlocks() {
  if (project.mode === 'blocks') { ide?.setFocus('blocks'); return; }
  try { project = returnToBlocks(project); ide?.setFocus('blocks'); refreshCode(); renderConfig(); persist(); notify('Đã lưu bản C++ và cấu hình vào lịch sử. Blockly tiếp tục từ snapshot trước đó.'); }
  catch (error) { notify(describeError(error), true); }
}
$('code-mode').onclick = enterCode; $('blocks-mode').onclick = enterBlocks; $('restore-blocks').onclick = enterBlocks;
codeArea.oninput = () => { if (project.mode !== 'code') return; project.code = codeArea.value; syncButtons(); persist(); };
$<HTMLInputElement>('project-name').onchange = event => { const input = event.target as HTMLInputElement; project.name = input.value.trim() || 'Project ESP32'; input.value = project.name; persist(); };
function download(name: string, data: string | Uint8Array, type = 'application/json') {
  const content = typeof data === 'string' ? data : new Uint8Array(data).buffer;
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportProject() { snapshot(); download('espstudio-project.json', JSON.stringify(project, null, 2)); }
$('export-project').onclick = exportProject;
$('open-example').onclick = () => {
  if (!confirm(t('Mở project mới sẽ thay không gian hiện tại. Bấm OK để tải bản sao project hiện tại trước khi mở.'))) return;
  $<HTMLDialogElement>('project-dialog').close(); exportProject(); const selected = example($<HTMLSelectElement>('example-select').value);
  project = { schemaVersion: 1, name: selected.name, config: selected.config, workspace: selected.workspace, mode: 'blocks', code: '', codeHistory: [] };
  suppressEvents = true; setDevices(project.config.devices); Blockly.serialization.workspaces.load(project.workspace, workspace); suppressEvents = false;
  $<HTMLInputElement>('project-name').value = project.name; renderConfig(); refreshCode(); persist();
  requestAnimationFrame(() => workspace.scrollCenter());
  notify('Đã mở project. Chưa tự nạp hoặc chạy thiết bị. Kiểm tra sơ đồ chân trước khi thử phần cứng.');
};
$('export-config').onclick = () => download('board.config.json', JSON.stringify(project.config, null, 2));
$('export-source').onclick = () => {
  if (generationError) return notify('Hãy sửa lỗi Blockly trước khi xuất firmware.', true);
  snapshot(); const files: Record<string, Uint8Array> = {};
  for (const [file, text] of Object.entries({ 'src/main.cpp': project.code, 'platformio.ini': platformioIni(project.config), 'board.config.json': JSON.stringify(project.config, null, 2), 'espstudio-project.json': JSON.stringify(project, null, 2), 'README.txt': 'TT ESPStudio\nBuild: pio run\nUpload: pio run -t upload --upload-port COMx\nSerial: pio device monitor -b 115200\nConfirm board wiring before upload.\n' })) files[file] = strToU8(text);
  download('espstudio-platformio.zip', zipSync(files), 'application/zip');
};
let fileAction: 'project' | 'config' = 'project';
function pickFile(action: typeof fileAction) { $<HTMLDialogElement>('project-dialog').close(); fileAction = action; $<HTMLInputElement>('file-input').value = ''; $<HTMLInputElement>('file-input').click(); }
$('import-project').onclick = () => pickFile('project'); $('import-config').onclick = () => pickFile('config');
$<HTMLInputElement>('file-input').onchange = async event => {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
  try {
    if (file.size > 12000000) throw new Error('File quá lớn (giới hạn 12 MB).');
    const data = JSON.parse(await file.text());
    if (fileAction === 'config') applyConfig(parseConfig(data));
    else {
      const next = projectSchema.parse(data);
      try { validateWorkspace(next.workspace, next.config); } finally { setDevices(project.config.devices); }
      if (!confirm(t('Nhập project sẽ thay không gian đang mở. Bấm OK để tải bản sao project hiện tại rồi nhập.'))) return;
      exportProject(); suppressEvents = true;
      setDevices(next.config.devices); Blockly.serialization.workspaces.load(next.workspace, workspace); project = next; suppressEvents = false;
      $<HTMLInputElement>('project-name').value = project.name; refreshCode(); renderConfig(); persist(); notify('Đã nhập project. Bản trước được tải xuống máy.');
    }
  } catch (error) { suppressEvents = false; notify(describeError(error), true); }
};
function renderConfig() {
  configPending = false; draftStatus.hidden = true;
  const config = project.config;
  $<HTMLInputElement>('config-name').value = config.board.name; $<HTMLSelectElement>('config-target').value = config.board.target;
  $<HTMLSelectElement>('config-serial').value = config.board.serialTransport ?? 'default';
  $<HTMLSelectElement>('config-upload-reset').value = config.board.uploadReset ?? 'auto';
  updateUsbHelp();
  $<HTMLInputElement>('config-pins').value = config.board.exposedPins.join(', ');
  $<HTMLTextAreaElement>('config-json').value = JSON.stringify(config, null, 2); $('config-errors').textContent = '';
  $('device-list').replaceChildren(); config.devices.forEach(d => $('device-list').append(createDeviceRow(d.driver, d.id, d)));
  $('gpio-options').replaceChildren(...config.board.exposedPins.map(pin => new Option('GPIO' + pin, String(pin))));
  const warnings = configWarnings(config); $('config-warnings').textContent = warnings.length ? 'THAM KHẢO — KHÔNG CHẶN CẤU HÌNH / BUILD / NẠP\n' + warnings.join('\n') : '';
  $('pwm-resources').textContent = Object.entries(allocatePwm(config)).map(([id, channel]) => id + ': LEDC ' + channel + ' / timer ' + Math.floor(channel / 2)).join(' · ');
  syncButtons();
}
$('add-device').onclick = () => {
  const rows = [...document.querySelectorAll<HTMLInputElement>('.d-id')]; let n = 1; while (rows.some(el => el.value === `device_${n}`)) n++;
  const driver = $<HTMLSelectElement>('driver-select').value as Driver;
  $('device-list').append(createDeviceRow(driver, `device_${n}`));
  markConfigPending();
};
$<HTMLSelectElement>('config-target').onchange = () => { updateUsbHelp(); notify('Đã đổi target trong bản nháp. Danh sách GPIO của bạn được giữ nguyên; áp dụng cấu hình khi sẵn sàng.'); };
function updateUsbHelp() {
  const target = $<HTMLSelectElement>('config-target').value;
  $('usb-settings').hidden = target === 'esp32';
  const serial = $<HTMLSelectElement>('config-serial');
  if (target === 'esp32' && serial.value === 'usb-cdc') serial.value = 'default';
  document.querySelectorAll<HTMLButtonElement>('[data-transport]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.transport===serial.value)));
  $('usb-help').textContent = serial.value === 'usb-cdc' ? (target === 'esp32c3' ? 'USB Serial/JTAG · Serial qua cổng USB trực tiếp của chip.' : 'Bật CDC khi khởi động để dùng Serial qua USB trực tiếp.') : serial.value === 'uart' ? 'Dùng cổng nối qua CP210x, CH340 hoặc chip USB–Serial khác.' : 'Giữ thiết lập USB của board profile.';
}
$<HTMLSelectElement>('config-serial').onchange = updateUsbHelp;
document.querySelectorAll<HTMLButtonElement>('[data-transport]').forEach(button=>button.onclick=()=>{
  $<HTMLSelectElement>('config-serial').value=button.dataset.transport!;updateUsbHelp();markConfigPending();
});
function applyConfig(config: Config) {
  if (project.mode === 'code') throw new Error('Hãy quay về Blockly trước khi đổi cấu hình.');
  for (const block of workspace.getAllBlocks(false)) {
    if (deviceBlocks[block.type] && block.getFieldValue('DEVICE') !== '__missing__' && !config.devices.some(d => d.id === block.getFieldValue('DEVICE') && deviceBlocks[block.type].includes(d.driver))) throw new Error(`devices: thiết bị “${block.getFieldValue('DEVICE')}” đang được dùng trong Blockly. Đổi hoặc xóa block tham chiếu trước khi xóa/đổi định danh hoặc loại thiết bị.`);
  }
  project.config = config; setDevices(config.devices); renderConfig(); refreshCode(); persist();
  if (!generationError) notify('Đã áp dụng cấu hình. Blockly và C++ sử dụng cùng dữ liệu.');
}
$<HTMLFormElement>('config-form').onsubmit = event => {
  event.preventDefault();
  try {
    const config = { schemaVersion: 1, board: { name: $<HTMLInputElement>('config-name').value, target: $<HTMLSelectElement>('config-target').value, ...($<HTMLSelectElement>('config-serial').value !== 'default' ? { serialTransport: $<HTMLSelectElement>('config-serial').value } : {}), ...($<HTMLSelectElement>('config-upload-reset').value === 'manual' ? { uploadReset: 'manual' } : {}), exposedPins: ($<HTMLInputElement>('config-pins').value.trim() ? $<HTMLInputElement>('config-pins').value.split(',').map(v => v.trim() ? Number(v.trim()) : NaN) : []) }, devices: [...document.querySelectorAll<HTMLElement>('.device-row')].map(readDeviceRow) };
    applyConfig(parseConfig(config));
  } catch (error) { $('config-errors').textContent = describeError(error); notify('Cấu hình chưa được áp dụng. Xem vị trí lỗi bên dưới.', true); }
};
$('apply-json').onclick = () => { try { applyConfig(parseConfig(JSON.parse($<HTMLTextAreaElement>('config-json').value))); } catch (error) { markConfigPending(); $('config-errors').textContent = describeError(error); notify('Cấu hình chưa được áp dụng. Xem vị trí lỗi bên dưới.', true); } };
$('new-board').onclick = () => {
  markConfigPending();
  $<HTMLInputElement>('config-name').value = 'Board của tôi'; $('device-list').replaceChildren(); notify('Đang tạo board trong bản nháp. Chọn target, chân và thêm GPIO output, rồi bấm Áp dụng cấu hình GUI.');
};
$('history').onclick = () => {
  $('history-items').replaceChildren();
  project.codeHistory.forEach((item, index) => {
    const row = document.createElement('div'); row.className = 'history-row'; const label = document.createElement('span'); label.textContent = `${index + 1}. ${new Date(item.savedAt).toLocaleString('vi-VN')} · ${item.config.board.name}`;
    const button = document.createElement('button'); button.textContent = 'Tải C++ + config'; button.onclick = () => download(`cpp-history-${index + 1}.zip`, zipSync({ 'src/main.cpp': strToU8(item.code), 'platformio.ini': strToU8(platformioIni(item.config)), 'board.config.json': strToU8(JSON.stringify(item.config, null, 2)) }), 'application/zip'); row.append(label, button); $('history-items').append(row);
  });
  if (!project.codeHistory.length) $('history-items').textContent = 'Chưa có bản C++ lưu trong lịch sử.';
  $<HTMLDialogElement>('project-dialog').close(); $<HTMLDialogElement>('history-dialog').showModal();
};
$('close-history').onclick = () => $<HTMLDialogElement>('history-dialog').close();
$('clear-history').onclick = () => { if (confirm(t('Xuất toàn bộ project rồi xóa lịch sử C++ khỏi phiên làm việc?'))) { exportProject(); project.codeHistory = []; persist(); syncButtons(); $<HTMLDialogElement>('history-dialog').close(); } };
async function api(path: string, body?: unknown) {
  try { return await compiler.request(path, body); }
  catch (error) { if (!compiler.token) { token = ''; lastBuild = null; syncButtons(); } throw error; }
}
let bridgeNotice = '';
async function connectBridge() {
  try {
    await compiler.connect();
    token = compiler.token; $('bridge-state').textContent = compiler.isAgent ? '● Agent đã ghép nối' : '● Bridge sẵn sàng'; $('agent-message').textContent = 'Compiler đã kết nối và sẵn sàng.';
    if (bridgeNotice && $('notice').dataset.message === bridgeNotice) $('notice').hidden = true;
    bridgeNotice = '';
    if (serialMonitor?.info && !busy) void resolveDevice().catch(error => notify(describeError(error), true));
  }
  catch (error) { token = ''; lastBuild = null; $('bridge-state').textContent = compiler.isAgent ? 'Agent chưa sẵn sàng' : 'Bridge chưa chạy'; $('agent-message').textContent = describeError(error); if (!startupError) { bridgeNotice = compiler.isAgent ? `Chưa thể build/nạp: ${describeError(error)} Trình soạn thảo vẫn hoạt động.` : 'Chạy Start-ESPStudio.cmd để bật build/upload cục bộ. Trình soạn thảo vẫn hoạt động.'; notify(bridgeNotice); } }
  syncButtons();
}
type Job = { diagnostic?: string; id: string; status: 'running' | 'success' | 'error' | 'cancelled'; log: string; kind: string };
async function watchJob(job: Job) {
  phase = job.kind === 'upload' ? 'uploading' : 'building'; syncButtons();
  activeJob = job.id; cancelButton.hidden = !compiler.isAgent || job.kind !== 'build';
  try {
  while (true) {
    $('build-log').textContent = job.log; $('build-log').scrollTop = $('build-log').scrollHeight;
    $('job-status').textContent = `${job.kind === 'build' ? 'Biên dịch' : 'Nạp'} · ${job.status}`;
    if (job.status !== 'running') return job;
    await new Promise(resolve => setTimeout(resolve, 800)); job = await api(`jobs/${job.id}`);
  }
  } finally { activeJob = null; cancelButton.hidden = true; }
}
async function buildFirmware(): Promise<boolean> {
  if (compiler.isAgent && !compiler.usbConfiguration && (project.config.board.serialTransport || project.config.board.uploadReset)) { notify('Cấu hình USB/reset cần Agent preview.4 trở lên. Cài và mở bản mới rồi ghép nối lại.', true); return false; }
  if (compiler.isAgent && !compiler.supportedTargets.includes(project.config.board.target)) { notify('Agent đang kết nối chưa hỗ trợ chip này. Cài và mở bản Agent mới rồi kết nối lại.', true); return false; }
  if (project.mode === 'blocks') refreshCode();
  if (generationError || configPending || busy) return false; busy = true; phase = 'building'; lastBuild = null; syncButtons(); const submitted = fingerprint();
  ide?.showMonitor('build');
  try {
    const result = await watchJob(await api('build', { config: project.config, code: project.code }));
    if (result.status === 'success') { lastBuild = { id: result.id, fingerprint: submitted }; $('build-state').textContent = 'Build thành công. Chọn cổng để nạp firmware.'; notify('Biên dịch thành công. Chọn thiết bị trên thanh công cụ; mở menu biên dịch để nạp bản vừa tạo.'); return true; }
    else { $('build-state').textContent = 'Biên dịch thất bại. Xem nhật ký biên dịch.'; notify('Biên dịch thất bại. Chi tiết từ toolchain nằm trong nhật ký biên dịch.', true); }
  } catch (error) { notify(describeError(error), true); }
  finally { busy = false; phase = null; syncButtons(); }
  return false;
}
function closeBuildMenu() { $('build-menu').hidden = true; $('build-options').setAttribute('aria-expanded','false'); }
$('build-options').onclick = () => { const open = $('build-menu').hidden; $('build-menu').hidden = !open; $('build-options').setAttribute('aria-expanded',String(open)); };
document.addEventListener('click', event => { if (!(event.target as Element).closest('.build-controls')) closeBuildMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeBuildMenu(); });
document.querySelectorAll<HTMLButtonElement>('[data-build-action]').forEach(button => button.onclick = () => { buildAction = button.dataset.buildAction as 'build'|'upload'; closeBuildMenu(); syncButtons(); });
$('build').onclick = async () => {
  closeBuildMenu();
  if (!token) { notify('Bấm Compiler trên thanh công cụ để kết nối.'); return; }
  const action = buildAction;
  if (action === 'upload') { try { await resolveDevice(); } catch (error) { notify(describeError(error), true); return; } }
  const port = uploadPort?.port; const deviceRevision = serialMonitor?.revision;
  const submitted = fingerprint();
  if (!await buildFirmware() || action !== 'upload') return;
  if (submitted !== fingerprint() || port !== uploadPort?.port || deviceRevision !== serialMonitor?.revision || configPending) { notify('Chương trình hoặc cổng đã thay đổi. Hãy biên dịch và nạp lại bản hiện tại.', true); return; }
  await uploadFirmware();
};
async function resolveDevice(): Promise<AgentPort> {
  if (mappingInvalid) throw new Error('Thiết bị đã thay đổi. Hãy chọn lại thiết bị.');
  const info = serialMonitor?.info; const revision = serialMonitor?.revision;
  if (!info) throw new Error('Bấm Chọn thiết bị trước khi nạp.');
  const ports = await api('ports') as AgentPort[];
  if (revision !== serialMonitor?.revision) throw new Error('Thiết bị đã thay đổi. Hãy chọn lại thiết bị.');
  const matches = matchingPorts(info, ports);
  if (matches.length !== 1) {
    uploadPort = null; serialMonitor?.setLabel(''); syncButtons();
    throw new Error(matches.length > 1 ? 'Có nhiều thiết bị USB cùng loại. Chỉ giữ board cần nạp rồi bấm Chọn thiết bị để đối chiếu lại.' : 'Chưa tìm được cổng COM của thiết bị đã chọn. Kiểm tra USB, driver và Compiler rồi chọn lại thiết bị.');
  }
  const previous = uploadPort; uploadPort = matches[0];
  serialMonitor?.setLabel(portLabel(uploadPort)); syncButtons();
  if (previous && (previous.port !== uploadPort.port || previous.hwid !== uploadPort.hwid)) {
    mappingInvalid = true;
    uploadPort = null; serialMonitor?.setLabel(''); syncButtons();
    throw new Error('Thiết bị đã thay đổi. Hãy chọn lại thiết bị.');
  }
  return uploadPort;
}
async function uploadFirmware() {
  closeBuildMenu(); ide?.showMonitor('build');
  const port = uploadPort?.port;
  if (generationError || configPending || !lastBuild || lastBuild.fingerprint !== fingerprint() || !port || busy) return;
  const buildId = lastBuild.id; const revision = serialMonitor?.revision;
  try { await resolveDevice(); } catch (error) { notify(describeError(error), true); return; }
  if (!lastBuild || lastBuild.id !== buildId || lastBuild.fingerprint !== fingerprint() || revision !== serialMonitor?.revision || configPending || busy) return;
  if (!compiler.nativeUploadConsent && !confirm(t(`Nạp firmware vào ${port} (${targets[project.config.board.target].label})? Firmware hiện tại sẽ bị thay thế. Kiểm tra đúng board và dây nối trước khi tiếp tục.`))) return;
  if (compiler.nativeUploadConsent) notify('Kiểm tra board/cổng và xác nhận nạp trên cửa sổ TT ESPStudio Agent.');
  busy = true; phase = compiler.nativeUploadConsent ? 'confirmation' : 'uploading'; syncButtons();
  try { await serialMonitor?.suspend(); const result = await watchJob(await api('upload', { buildId: lastBuild.id, port })); const message = result.status === 'success' ? (project.config.board.uploadReset === 'manual' ? 'Đã nạp firmware. Nhấn RST để chạy chương trình, rồi chọn lại thiết bị nếu COM thay đổi.' : 'Nạp thành công. Kiểm tra chương trình trên board; nếu USB đổi cổng, chọn lại thiết bị để dùng Serial.') : result.diagnostic ?? 'Nạp thất bại. Kiểm tra cổng, nút BOOT và log nạp.'; $('build-state').textContent = message; notify(message, result.status !== 'success'); }
  catch (error) { notify(describeError(error), true); }
  finally {
    phase=null;
    let returnedPort:AgentPort|undefined;
    const reopened=await serialMonitor?.resume(async()=>{
      const ports=await api('ports') as AgentPort[];
      const sameCom=ports.filter(candidate=>candidate.port===port);
      if(sameCom.length!==1)return null;
      const identity=portUsbIdentity(sameCom[0]);
      if(!identity||matchingPorts(identity,ports).length!==1)return null;
      returnedPort=sameCom[0];return identity;
    });
    if(reopened&&returnedPort){uploadPort=returnedPort;mappingInvalid=false;serialMonitor?.setLabel(portLabel(returnedPort));}
    busy=false;syncButtons();
  }
};
$('upload').onclick = () => void uploadFirmware();
$('clear-log').onclick = () => { $('build-log').textContent = ''; };
serialMonitor = new SerialMonitor(notify, () => ide?.showMonitor('serial'), () => {
  uploadPort = null; mappingInvalid = false; syncButtons();
  if (token && serialMonitor?.info && !busy) void resolveDevice().catch(error => notify(describeError(error), true));
});
// An expired or stopped Agent must not leave a green Compiler badge.
setInterval(() => {
  if (!token || busy || document.hidden) return;
  void compiler.request('session').catch(() => { token = ''; lastBuild = null; syncButtons(); });
}, 15000);
window.addEventListener('resize', () => { if (currentView === 'program') Blockly.svgResize(workspace); });
renderConfig(); refreshCode();
requestAnimationFrame(() => { if (innerWidth <= 800) workspace.zoomToFit(); else workspace.scrollCenter(); });
if (startupError) { notify(startupError, true); const rescue = document.createElement('button'); rescue.textContent = 'Tải bản cứu hộ & cho phép lưu mới'; rescue.onclick = () => { download('espstudio-recovery.json', damagedSave); storageLocked = false; persist(); notify('Bản gốc đã được tải xuống. Có thể lưu project mới.'); }; $('notice').append(rescue); }
else persist();
if (!compiler.isAgent || compiler.token) void connectBridge();
else { $('bridge-state').textContent = 'Agent chưa kết nối'; syncButtons(); }

initLocale();
