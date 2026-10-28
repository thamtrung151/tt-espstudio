import './style.css';
import './robotics.css';
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
document.querySelector('#app')!.innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="#" aria-label="TT ESPStudio"><span class="brand-mark">tt<span>↗</span></span><span>ESPStudio<small>ROBOTICS · STEAM</small></span></a>
    <div class="workspace-label">KHÔNG GIAN LÀM VIỆC</div>
    <nav aria-label="Điều hướng chính">
      <button class="nav active" data-view="program"><span>⌘</span> Lập trình <kbd>01</kbd></button>
      <button class="nav" data-view="config"><span>⚙</span> Configuration <kbd>02</kbd></button>
      <button class="nav" data-view="device"><span>⇄</span> Thiết bị <kbd>03</kbd></button>
      <button class="nav" data-view="guide"><span>◈</span> Hướng dẫn <kbd>04</kbd></button>
    </nav>
    <div class="sidebar-note"><span class="eyebrow">TỪ Ý TƯỞNG ĐẾN CHUYỂN ĐỘNG</span><p>Board của bạn.<br>Chương trình của bạn.</p><div class="mini-circuit">○ ━━━ ▣ ━━━ ○<br>└ ──────── ┘</div></div>
    <div class="sidebar-bottom"><span class="dot"></span> Workspace <span>v0.3 preview</span></div>
  </aside>
  <div class="shell">
    <header><div class="breadcrumb">Workspace <span>/</span> <input id="project-name" aria-label="Tên project" maxlength="80"></div><div class="header-actions"><span id="save-state">Lưu trên máy</span><button id="import-project" class="quiet">↥ Nhập project</button><button id="export-project" class="quiet">↧ Lưu project</button></div></header>
    <main>
      <section class="page-heading"><div><div class="eyebrow">BUILD SOMETHING THAT MOVES</div><h1 id="page-title">Một ý tưởng. Một chương trình.</h1><p id="page-description">Kéo block, hiểu C++, và đưa ý tưởng lên board của bạn.</p></div><span class="phase-badge">GPIO · ADC · PWM · ROBOTICS</span></section>
      <div id="notice" role="status" aria-live="polite" hidden></div>
      <div class="board-bar"><div class="board-chip">▦</div><div><strong id="board-name"></strong><span id="board-subtitle"></span></div><button class="text-button" id="edit-board">Cấu hình board ↗</button><div class="board-right"><span id="bridge-state" class="status-pill">Bridge: đang kiểm tra…</span><button id="build" class="primary">▷ Biên dịch</button></div></div>
      <section id="program-view" class="view">
        <div class="example-bar"><label for="example-select">Bắt đầu với</label><select id="example-select"><option value="empty">Board trống — chưa gán thiết bị</option><option value="doit-led">DOIT · LED onboard GPIO2</option><option value="input-adc">DOIT · Nút nhấn + ADC</option></select><button id="open-example">Mở ví dụ / project mới</button></div><div class="editor-toolbar"><div class="segmented"><button id="blocks-mode">Blockly</button><button id="code-mode">C++ tự do</button></div><span id="mode-note"></span><button id="history" class="quiet">Lịch sử C++ <span id="history-count">0</span></button><button id="export-source" class="quiet">↧ Xuất PlatformIO</button></div>
        <div class="editors"><section class="block-pane"><div class="pane-title"><strong>Chương trình trực quan</strong><span>Kéo thả để bắt đầu</span></div><div id="blockly"></div><div id="block-lock" hidden><strong>Đang chỉnh sửa C++</strong><p>Snapshot Blockly được giữ lại.<br>Quay về Blockly sẽ lưu bản C++ vào lịch sử.</p><button id="restore-blocks">Lưu C++ & quay về Blockly</button></div></section><section class="code-pane"><div class="pane-title"><strong><span class="file-dot"></span> main.cpp</strong><span id="code-badge">SINH TỪ BLOCKLY</span></div><div class="code-wrap"><textarea id="code" aria-label="Mã nguồn C++" spellcheck="false" wrap="off"></textarea></div><div class="code-footer"><span id="code-selection">Chọn block để xem đoạn C++ tương ứng</span><span>Arduino C++ · UTF-8</span></div></section></div>
        <div class="editor-footnote"><span><span class="dot"></span> Blockly → C++ · Đồng bộ một chiều</span><span>Chân lấy từ Configuration · Driver mới cần thử phần cứng</span></div>
      </section>
      <section id="config-view" class="view" hidden>
        <div class="section-intro"><div><h2>Phần cứng được mô tả bằng dữ liệu</h2><p>Gán thiết bị và chân GPIO. GUI và JSON sử dụng cùng một cấu hình.</p></div><button id="export-config">↧ Xuất config</button><button id="import-config">↥ Nhập config</button></div>
        <p id="config-lock" class="info" hidden>Cấu hình đang khóa để giữ đúng bản C++ tự do. Hãy lưu C++ và quay về Blockly trước khi đổi cấu hình.</p>
        <div class="config-grid"><form id="config-form" class="card"><div class="card-heading"><h3>01 / Board profile</h3><button id="new-board" type="button" class="quiet">Tạo board trống</button></div><label>Tên board<input id="config-name" required maxlength="80"></label><label>Chip / build target<select id="config-target"><option value="esp32">ESP32 DevKit / WROOM</option><option value="esp32s3">ESP32-S3 / board tùy biến</option></select></label><label>GPIO trên board — danh sách của bạn (phân cách bằng dấu phẩy)<input id="config-pins" required></label><p class="muted">Tự khai báo chân theo sơ đồ board; không có whitelist khóa GPIO. Có thể nhập chân ngoài danh sách gợi ý. Thông tin boot, flash, USB, ADC… chỉ để tham khảo.</p><div class="card-heading"><h3>02 / Thiết bị</h3><div class="add-device-controls"><select id="driver-select" aria-label="Loại thiết bị mới"><option value="gpio.output">GPIO output</option><option value="gpio.input">GPIO input</option><option value="adc.input">ADC input</option><option value="pwm.output">PWM output</option><option value="servo.pwm">Servo PWM</option><option value="motor.hbridge2">Motor 2 PWM · IN1 / IN2</option></select><button id="add-device" type="button" class="quiet">+ Thêm thiết bị</button></div></div><datalist id="gpio-options"></datalist><div id="device-list"></div><button class="primary" type="submit">Áp dụng cấu hình GUI</button></form>
        <div class="card"><div class="card-heading"><h3>config.json</h3><span class="subtle-label">SCHEMA v1</span></div><textarea id="config-json" aria-label="Cấu hình JSON" spellcheck="false"></textarea><button id="apply-json" class="primary">Áp dụng JSON</button><p class="muted">Chỉnh sửa chỉ có hiệu lực sau khi áp dụng. Khi có lỗi, cấu hình đang dùng được giữ nguyên.</p><pre id="config-errors" role="alert"></pre><pre id="config-warnings" class="pin-notes"></pre><div id="pwm-resources" class="muted"></div></div></div>
      </section>
      <section id="device-view" class="view" hidden>
        <div class="device-grid"><div class="card"><div class="eyebrow">01 / COMPILE & UPLOAD</div><h2>Đưa chương trình lên board</h2><p>Biên dịch trên máy này qua PlatformIO. Chọn đúng cổng USB trước khi nạp.</p><div class="connection-row"><select id="ports" aria-label="Cổng nạp firmware"><option value="">Chưa chọn cổng</option></select><button id="refresh-ports">Quét cổng</button></div><p id="build-state" class="info">Chưa có bản build thành công trong phiên này.</p><button id="upload" class="primary" disabled>↗ Nạp firmware</button><p class="muted">Nạp sẽ thay firmware hiện tại. ESP32 chạy chương trình độc lập sau khi nạp; không cần giữ web mở.</p></div>
        <div class="card"><div class="eyebrow">02 / SERIAL MONITOR</div><h2>Lắng nghe thiết bị</h2><p>Mở cổng qua trình duyệt để đọc log ở 115200 baud. Đóng Serial trước khi nạp firmware.</p><button id="serial-connect">Kết nối Serial</button><button id="serial-clear" class="quiet">Xóa log</button><pre id="serial-log" aria-label="Log serial">Chưa kết nối. Cần Chrome hoặc Edge hỗ trợ Web Serial.</pre><p class="muted">Đây là dữ liệu serial thực. Chưa có debug từng bước hoặc theo dõi block đang chạy.</p></div></div>
      </section>
      <section id="guide-view" class="view" hidden><div class="guide-grid"><div class="card"><div class="eyebrow">BÀI ĐẦU TIÊN</div><h2>Một đèn LED. Cả một luồng làm việc.</h2><ol class="steps"><li><strong>Khai báo phần cứng</strong><p>Ví dụ: GPIO23 → điện trở 330Ω → anode LED; cathode → GND. Đổi chân trong Configuration nếu sơ đồ board khác.</p></li><li><strong>Đọc chương trình</strong><p>Trong “Lặp mãi”, bật LED, chờ 500 ms, tắt LED, chờ 500 ms. Bấm block để chọn dòng C++ tương ứng.</p></li><li><strong>Biên dịch và nạp</strong><p>Bấm Biên dịch, mở Thiết bị, quét cổng và chọn đúng ESP32 DevKit. Nạp firmware rồi quan sát LED.</p></li><li><strong>Đi sâu hơn</strong><p>Chuyển sang C++ tự do. Bản block được khóa; code không bị tự ghi đè. Khi quay lại, bản C++ được lưu vào lịch sử và file project.</p></li></ol></div><div class="card guide-side"><span class="guide-icon">◈</span><h2>Nền móng trước.<br>Mở rộng tiếp.</h2><p>Đang có: GPIO input/output, ADC, PWM, servo và motor IN1/IN2 (hai PWM), Blockly + C++, cấu hình, build/upload và Serial.</p><p>Motor/servo chỉ cần khai báo khi thêm thiết bị. Motor chạy có thời hạn rồi dừng; servo không phát xung cho đến khi có block điều khiển. Tiếp theo: encoder, bus cảm biến, lưu online và AI.</p><div class="info">Chủ dự án đã báo thử thành công cả ESP32 và ESP32-S3. Chưa có bảng xác nhận riêng từng driver/ngoại vi.</div></div></div></section>
      <section class="console"><div class="console-heading"><strong><span class="dot"></span> Build console</strong><span id="job-status">Sẵn sàng</span><button id="clear-log" class="quiet">Xóa log</button></div><pre id="build-log" aria-label="Nhật ký biên dịch">TT ESPStudio · Chọn Biên dịch để kiểm tra firmware bằng toolchain thật.</pre></section>
    </main><footer><span>TT ESPStudio / ${compiler.isAgent ? 'Web + Agent preview' : 'Local development preview'}</span><span>Cấu hình mở · Blockly + C++ · ESP32</span></footer>
  </div>
  <input type="file" id="file-input" accept="application/json,.json" hidden>
  <dialog id="history-dialog"><div class="card-heading"><h2>Lịch sử C++</h2><button id="close-history" aria-label="Đóng lịch sử">✕</button></div><p>Bản C++ và cấu hình đi kèm được giữ trong project. Tải xuống để tiếp tục sử dụng.</p><div id="history-items"></div><button id="clear-history">Xóa lịch sử sau khi đã xuất project</button></dialog>
`;
const codeArea = $<HTMLTextAreaElement>('code');
// Keep the selector aligned with the schema/build profiles for every chip family.
$<HTMLSelectElement>('config-target').replaceChildren(...Object.entries(targets).map(([id, target]) => new Option(target.label, id)));
const connectButton = document.createElement('button'); connectButton.id = 'agent-connect'; connectButton.textContent = 'Kết nối compiler'; connectButton.className = 'quiet';
$('bridge-state').after(connectButton);
const agentPanel = document.createElement('div'); agentPanel.className = 'card'; agentPanel.id = 'agent-panel'; agentPanel.hidden = !compiler.isAgent;
agentPanel.innerHTML = `<h3>TT ESPStudio Agent · bản thử nghiệm</h3><p>Website giữ trình soạn thảo. Build và nạp chạy trên máy Windows của bạn qua Agent. Chưa có bộ cài người dùng cuối trong bản preview này.</p><p id="agent-help">Mở Agent trên máy, cho phép trình duyệt truy cập loopback nếu được hỏi, rồi kết nối. Mã ghép nối chỉ xuất hiện trên Agent.</p><button id="agent-pair-request">Yêu cầu ghép nối</button><form id="agent-pair-form" hidden><label>Mã 8 chữ số trên Agent<input id="agent-pair-code" inputmode="numeric" autocomplete="off" pattern="[0-9]{8}" maxlength="8" required></label><button type="submit">Xác nhận ghép nối</button></form><button id="agent-unpair" class="quiet">Ngắt ghép nối</button><p id="agent-message" role="status"></p>`;
$('device-view').prepend(agentPanel);
$('agent-help').textContent = 'Mở Agent trên máy, bấm Yêu cầu ghép nối và làm theo hướng dẫn xác nhận. Cho phép trình duyệt kết nối tới Agent nếu được hỏi.';
agentPanel.querySelector('p')!.textContent = 'ESPStudio Agent giúp biên dịch và nạp chương trình từ website lên board của bạn. Cài Agent và mở ứng dụng trước khi kết nối.';
const launchAgent = document.createElement('a'); launchAgent.href = 'ttespstudio://connect'; launchAgent.textContent = 'Mở Agent đã cài'; launchAgent.className = 'quiet';
launchAgent.title = 'Dành cho bộ cài có đăng ký liên kết TT ESPStudio. Bản Agent Dev vẫn mở bằng launcher .cmd.';
$('agent-help').after(launchAgent);
const cancelButton = document.createElement('button'); cancelButton.id = 'cancel-build'; cancelButton.textContent = 'Hủy biên dịch'; cancelButton.hidden = true;
$('clear-log').before(cancelButton);
let activeJob: string | null = null;
let pairingRequest = '';
connectButton.onclick = () => { if (compiler.isAgent) setView('device'); void connectBridge(); };
$('agent-pair-request').onclick = async () => {
  const button = $<HTMLButtonElement>('agent-pair-request');
  button.disabled = true; $<HTMLButtonElement>('agent-unpair').disabled = true;
  try {
    const request = await compiler.requestPairing(); pairingRequest = request.requestId;
    if (request.claimSecret) {
      $('agent-pair-form').hidden = true;
      $('agent-message').textContent = 'Kiểm tra địa chỉ website và chọn Có trên cửa sổ TT ESPStudio Agent. Không cần nhập mã.';
      await compiler.finishNativePairing(request); await connectBridge(); return;
    }
    $('agent-pair-form').hidden = false; $('agent-message').textContent = 'Kiểm tra đúng địa chỉ website trên cửa sổ Agent rồi nhập mã tại đây.';
    $<HTMLInputElement>('agent-pair-code').focus();
  } catch (error) { $('agent-message').textContent = describeError(error); }
  finally { button.disabled = false; $<HTMLButtonElement>('agent-unpair').disabled = false; }
};
$('agent-pair-form').onsubmit = async event => {
  event.preventDefault();
  try { await compiler.pair(pairingRequest, $<HTMLInputElement>('agent-pair-code').value); $<HTMLInputElement>('agent-pair-code').value = ''; $('agent-pair-form').hidden = true; await connectBridge(); }
  catch (error) { $('agent-message').textContent = describeError(error); }
};
$('agent-unpair').onclick = async () => {
  if (busy) return notify('Chờ tác vụ hiện tại kết thúc trước khi ngắt ghép nối.', true);
  try { await compiler.disconnect(); } catch { /* local session is cleared even offline */ }
  token = ''; lastBuild = null; $('bridge-state').textContent = 'Agent chưa ghép nối'; $('agent-message').textContent = 'Đã xóa phiên ghép nối trên web.'; syncButtons();
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
const workspace = Blockly.inject('blockly', { toolbox, trashcan: true, grid: { spacing: 22, length: 2, colour: '#cbd6d0', snap: true }, zoom: { controls: true, wheel: true, startScale: 0.86, maxScale: 1.4, minScale: 0.5 }, move: { scrollbars: true, drag: true, wheel: true }, sounds: false });
let generated: Generated | null = null; let generationError = ''; let suppressEvents = true; let busy = false; let token = '';
let lastBuild: { id: string; fingerprint: string } | null = null;
let currentView = 'program';
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
function notify(message: string, error = false) { $('notice').hidden = false; $('notice').textContent = message; $('notice').className = error ? 'error' : 'info'; }
function snapshot() { project.workspace = Blockly.serialization.workspaces.save(workspace); }
function persist() {
  snapshot(); if (storageLocked) { $('save-state').textContent = 'Chưa lưu — cần cứu hộ'; return; }
  try { localStorage.setItem(storageKey, JSON.stringify(project)); $('save-state').textContent = '✓ Đã lưu trên máy'; }
  catch { $('save-state').textContent = 'Lưu thất bại'; notify('Bộ nhớ trình duyệt đã đầy hoặc không khả dụng. Hãy xuất file project để giữ dữ liệu.', true); }
}
function fingerprint() { return JSON.stringify({ config: project.config, code: project.code }); }
function syncButtons() {
  const configMode = project.mode === 'code';
  $<HTMLButtonElement>('build').disabled = busy || !token || !!generationError || configPending;
  $<HTMLButtonElement>('upload').disabled = busy || !token || !!generationError || configPending || !lastBuild || lastBuild.fingerprint !== fingerprint() || !$<HTMLSelectElement>('ports').value;
  $('build').textContent = busy ? 'Đang xử lý…' : '▷ Biên dịch';
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
  codeArea.value = project.code; syncButtons();
  if (previousError && !generationError && $('notice').textContent === previousError) $('notice').hidden = true;
  const selected = Blockly.getSelected();
  selectedRange = generated && selected ? generated.ranges[selected.id] : undefined;
  paintCodeRange();
  $('code-selection').textContent = generationError ? 'Blockly chưa hợp lệ · C++ đang giữ bản sinh thành công gần nhất' : selectedRange ? `Block → dòng ${selectedRange.start}–${selectedRange.end}` : 'Chọn block để xem đoạn C++ tương ứng';
}
function setView(view: string) {
  currentView = view;
  document.querySelectorAll<HTMLElement>('.view').forEach(el => el.hidden = el.id !== `${view}-view`);
  document.querySelectorAll<HTMLElement>('.nav').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  const titles: Record<string, [string, string]> = { program: ['Một ý tưởng. Một chương trình.', 'Kéo block, hiểu C++, và đưa ý tưởng lên board của bạn.'], config: ['Bắt đầu từ phần cứng.', 'Board profile là nền móng của chương trình.'], device: ['Kết nối thế giới thật.', 'Biên dịch, nạp firmware và đọc dữ liệu từ ESP32.'], guide: ['Từng bước, cùng bạn.', 'Luồng thực hành đầu tiên với ESP32 DevKit.'] };
  $('page-title').textContent = titles[view][0]; $('page-description').textContent = titles[view][1];
  if (view === 'program') requestAnimationFrame(() => { Blockly.svgResize(workspace); workspace.scrollCenter(); });
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
      codeArea.setSelectionRange(start, end); codeArea.scrollTop = Math.max(0, (range.start - 5) * 23);
      $('code-selection').textContent = `Block → dòng ${range.start}–${range.end}`;
    }
    paintCodeRange();
  }
  if (suppressEvents || event.isUiEvent) return;
  if (project.mode === 'blocks') { refreshCode(); persist(); }
});
function enterCode() {
  if (project.mode === 'code') return;
  const hadError = !!generationError;
  snapshot(); project.mode = 'code'; generationError = ''; selectedRange = undefined;
  syncButtons(); paintCodeRange(); persist(); codeArea.focus();
  $('code-selection').textContent = 'Đang chỉnh sửa C++ tự do';
  if (hadError) notify('Blockly chưa hợp lệ. Bạn đang sửa bản C++ được giữ lại trên màn hình; bản này chưa phản ánh các thay đổi Blockly bị lỗi. Snapshot các block vẫn được giữ.');
}
function enterBlocks() {
  if (project.mode === 'blocks') return;
  try { project = returnToBlocks(project); refreshCode(); renderConfig(); persist(); notify('Đã lưu bản C++ và cấu hình vào lịch sử. Blockly tiếp tục từ snapshot trước đó.'); }
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
  if (!confirm('Mở project mới sẽ thay không gian hiện tại. Bấm OK để tải bản sao project hiện tại trước khi mở.')) return;
  exportProject(); const selected = example($<HTMLSelectElement>('example-select').value);
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
function pickFile(action: typeof fileAction) { fileAction = action; $<HTMLInputElement>('file-input').value = ''; $<HTMLInputElement>('file-input').click(); }
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
      if (!confirm('Nhập project sẽ thay không gian đang mở. Bấm OK để tải bản sao project hiện tại rồi nhập.')) return;
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
$<HTMLSelectElement>('config-target').onchange = () => { notify('Đã đổi target trong bản nháp. Danh sách GPIO của bạn được giữ nguyên; áp dụng cấu hình khi sẵn sàng.'); };
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
    const config = { schemaVersion: 1, board: { name: $<HTMLInputElement>('config-name').value, target: $<HTMLSelectElement>('config-target').value, exposedPins: ($<HTMLInputElement>('config-pins').value.trim() ? $<HTMLInputElement>('config-pins').value.split(',').map(v => v.trim() ? Number(v.trim()) : NaN) : []) }, devices: [...document.querySelectorAll<HTMLElement>('.device-row')].map(readDeviceRow) };
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
  $<HTMLDialogElement>('history-dialog').showModal();
};
$('close-history').onclick = () => $<HTMLDialogElement>('history-dialog').close();
$('clear-history').onclick = () => { if (confirm('Xuất toàn bộ project rồi xóa lịch sử C++ khỏi phiên làm việc?')) { exportProject(); project.codeHistory = []; persist(); syncButtons(); $<HTMLDialogElement>('history-dialog').close(); } };
async function api(path: string, body?: unknown) {
  try { return await compiler.request(path, body); }
  catch (error) { if (!compiler.token) { token = ''; lastBuild = null; syncButtons(); } throw error; }
}
let bridgeNotice = '';
async function connectBridge() {
  try {
    await compiler.connect();
    token = compiler.token; $('bridge-state').textContent = compiler.isAgent ? '● Agent đã ghép nối' : '● Bridge sẵn sàng'; $('agent-message').textContent = 'Compiler đã kết nối và sẵn sàng.';
    if (bridgeNotice && $('notice').textContent === bridgeNotice) $('notice').hidden = true;
    bridgeNotice = '';
  }
  catch (error) { token = ''; lastBuild = null; $('bridge-state').textContent = compiler.isAgent ? 'Agent chưa sẵn sàng' : 'Bridge chưa chạy'; $('agent-message').textContent = describeError(error); if (!startupError) { bridgeNotice = compiler.isAgent ? `Chưa thể build/nạp: ${describeError(error)} Trình soạn thảo vẫn hoạt động.` : 'Chạy Start-ESPStudio.cmd để bật build/upload cục bộ. Trình soạn thảo vẫn hoạt động.'; notify(bridgeNotice); } }
  syncButtons();
}
type Job = { id: string; status: 'running' | 'success' | 'error' | 'cancelled'; log: string; kind: string };
async function watchJob(job: Job) {
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
$('build').onclick = async () => {
  if (compiler.isAgent && !compiler.supportedTargets.includes(project.config.board.target)) return notify('Agent đang kết nối chưa hỗ trợ chip này. Cài và mở bản Agent mới rồi kết nối lại.', true);
  if (project.mode === 'blocks') refreshCode();
  if (generationError || configPending || busy) return; busy = true; lastBuild = null; syncButtons(); const submitted = fingerprint();
  try {
    const result = await watchJob(await api('build', { config: project.config, code: project.code }));
    if (result.status === 'success') { lastBuild = { id: result.id, fingerprint: submitted }; $('build-state').textContent = 'Build thành công. Chọn cổng để nạp firmware.'; notify('Biên dịch firmware thành công. Mở Thiết bị để chọn cổng và nạp.'); }
    else { $('build-state').textContent = 'Biên dịch thất bại. Xem Build console.'; notify('Biên dịch thất bại. Chi tiết từ toolchain nằm trong Build console.', true); }
  } catch (error) { notify(describeError(error), true); }
  finally { busy = false; syncButtons(); }
};
$('refresh-ports').onclick = async () => {
  try { if (!token) await connectBridge(); const ports = await api('ports') as { port: string; description?: string }[]; const select = $<HTMLSelectElement>('ports'); select.replaceChildren(new Option('Chọn đúng cổng ESP32…', '')); for (const p of ports) select.add(new Option(`${p.port} · ${p.description ?? 'Serial'}`, p.port)); notify(ports.length ? 'Đã cập nhật danh sách cổng. Chọn đúng board của bạn.' : 'Chưa tìm thấy cổng serial. Kiểm tra USB và driver.'); syncButtons(); }
  catch (error) { notify(describeError(error), true); }
};
$('ports').onchange = syncButtons;
$('upload').onclick = async () => {
  const port = $<HTMLSelectElement>('ports').value;
  if (generationError || configPending || !lastBuild || lastBuild.fingerprint !== fingerprint() || !port || busy) return;
  if (!compiler.nativeUploadConsent && !confirm(`Nạp firmware vào ${port} (${targets[project.config.board.target].label})? Firmware hiện tại sẽ bị thay thế. Kiểm tra đúng board và dây nối trước khi tiếp tục.`)) return;
  if (compiler.nativeUploadConsent) notify('Kiểm tra board/cổng và xác nhận nạp trên cửa sổ TT ESPStudio Agent.');
  busy = true; syncButtons();
  try { await disconnectSerial(); const result = await watchJob(await api('upload', { buildId: lastBuild.id, port })); notify(result.status === 'success' ? 'Nạp thành công. Hãy quan sát LED trên board thật để xác nhận hoạt động.' : 'Nạp thất bại. Kiểm tra cổng, nút BOOT và log nạp.', result.status !== 'success'); }
  catch (error) { notify(describeError(error), true); }
  finally { busy = false; syncButtons(); }
};
$('clear-log').onclick = () => { $('build-log').textContent = ''; };
interface SerialPortLike { readable: ReadableStream<Uint8Array> | null; open(options: { baudRate: number }): Promise<void>; close(): Promise<void> }
const serial = (navigator as Navigator & { serial?: { requestPort(): Promise<SerialPortLike> } }).serial;
let serialPort: SerialPortLike | null = null; let reader: ReadableStreamDefaultReader<Uint8Array> | null = null; let reading: Promise<void> | null = null;
async function disconnectSerial() { if (reader) await reader.cancel(); if (reading) await reading; if (serialPort) { await serialPort.close(); serialPort = null; } $('serial-connect').textContent = 'Kết nối Serial'; }
$('serial-connect').onclick = async () => {
  try {
    if (serialPort) { await disconnectSerial(); return; }
    if (!serial) throw new Error('Trình duyệt chưa hỗ trợ Web Serial. Hãy dùng Chrome/Edge trên máy tính.');
    serialPort = await serial.requestPort(); await serialPort.open({ baudRate: 115200 });
    reader = serialPort.readable!.getReader(); $('serial-connect').textContent = 'Ngắt Serial'; $('serial-log').textContent = '';
    reading = (async () => { const decoder = new TextDecoder(); try { while (reader) { const { value, done } = await reader.read(); if (done) break; $('serial-log').textContent = ($('serial-log').textContent + decoder.decode(value, { stream: true })).slice(-40000); $('serial-log').scrollTop = $('serial-log').scrollHeight; } } catch (error) { $('serial-log').textContent += `\n${describeError(error)}`; } finally { reader?.releaseLock(); reader = null; } })();
  } catch (error) { serialPort = null; notify(describeError(error), true); }
};
$('serial-clear').onclick = () => { $('serial-log').textContent = ''; };
window.addEventListener('resize', () => { if (currentView === 'program') Blockly.svgResize(workspace); });
renderConfig(); refreshCode();
requestAnimationFrame(() => workspace.scrollCenter());
if (startupError) { notify(startupError, true); const rescue = document.createElement('button'); rescue.textContent = 'Tải bản cứu hộ & cho phép lưu mới'; rescue.onclick = () => { download('espstudio-recovery.json', damagedSave); storageLocked = false; persist(); notify('Bản gốc đã được tải xuống. Có thể lưu project mới.'); }; $('notice').append(rescue); }
else persist();
if (!compiler.isAgent || compiler.token) void connectBridge();
else { $('bridge-state').textContent = 'Agent chưa kết nối'; syncButtons(); }
