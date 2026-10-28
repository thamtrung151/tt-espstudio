import { Blockly, localizeBlocks } from '../blocks';
import { icon } from './icons';
import { t, onLocaleChange } from './i18n';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const prefKey = 'tt-espstudio.ui.v1';
type Preferences = { ratio: number; collapsed: boolean; monitorHeight: number; theme: 'dark' | 'light' };
function readPreferences(): Preferences {
  let value: Partial<Preferences> = {};
  try { value = JSON.parse(localStorage.getItem(prefKey) ?? '{}') ?? {}; } catch { /* Defaults; project remains separate. */ }
  return { ratio: typeof value.ratio === 'number' ? Math.max(25,Math.min(75,value.ratio)) : 59, collapsed: value.collapsed === true, monitorHeight: typeof value.monitorHeight === 'number' ? Math.max(100,Math.min(300,value.monitorHeight)) : 154, theme: value.theme === 'light' ? 'light' : 'dark' };
}
export function highlightCpp(code: string): string {
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const pattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(void|int|bool|char|float|double|unsigned|long|const|constexpr|uint8_t|uint16_t|uint32_t|if|else|for|while|return|include|true|false)\b|\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)(?=\s*\()/g;
  let html='', last=0;
  for (const match of code.matchAll(pattern)) {
    html += escape(code.slice(last,match.index));
    const kind=match[1]?'comment':match[2]?'string':match[3]?'keyword':match[4]?'number':'call';
    html += `<span class="tok-${kind}">${escape(match[0])}</span>`; last=match.index!+match[0].length;
  }
  return html + escape(code.slice(last)) + '\n';
}
export function initIde(workspace: Blockly.WorkspaceSvg, code: HTMLTextAreaElement, notify: (text: string, error?: boolean) => void) {
  const preferences = readPreferences(); let monitorTab: 'serial' | 'build'='serial';
  const save = () => { try { localStorage.setItem(prefKey, JSON.stringify(preferences)); } catch { /* UI settings are optional. */ } };
  const resize = () => { if (!$('program-view').hidden) Blockly.svgResize(workspace); };
  const apply = () => {
    document.documentElement.style.setProperty('--ratio',preferences.ratio+'%');
    document.documentElement.style.setProperty('--monitor',Math.min(preferences.monitorHeight,innerHeight*.4)+'px');
    document.documentElement.dataset.theme=preferences.theme;
    $('monitor').classList.toggle('collapsed',preferences.collapsed);
    $('monitor-toggle').setAttribute('aria-expanded',String(!preferences.collapsed));
    $('pane-divider').setAttribute('aria-valuenow',String(Math.round(preferences.ratio)));
    requestAnimationFrame(resize); save();
  };
  function setFocus(mode: 'blocks'|'code', changeRatio=true) {
    document.querySelector('.ide')!.classList.toggle('code-focus',mode==='code');
    if (changeRatio) preferences.ratio=mode==='blocks'?59:35;
    apply();
  }
  function showMonitor(tab: 'serial'|'build', expand=true) {
    monitorTab=tab; if(expand) preferences.collapsed=false;
    for(const name of ['serial','build'] as const){ $(name+'-tab').setAttribute('aria-selected',String(name===tab)); $(name+'-log').hidden=name!==tab; $(name+'-tools').hidden=name!==tab; }
    apply();
  }
  $('serial-tab').onclick=()=>showMonitor('serial'); $('build-tab').onclick=()=>showMonitor('build');
  $('monitor-toggle').onclick=()=>{preferences.collapsed=!preferences.collapsed;apply()};
  $('theme-toggle').onclick=()=>{preferences.theme=preferences.theme==='dark'?'light':'dark';apply()};
  function dragDivider(id: string, update:(event: PointerEvent)=>void) {
    const el=$(id); el.onpointerdown=e=>{if(e.button!==0)return;el.setPointerCapture(e.pointerId);document.body.classList.add('resizing');e.preventDefault()};
    el.onpointermove=e=>{if(el.hasPointerCapture(e.pointerId)){update(e);apply()}};
    const end=()=>{document.body.classList.remove('resizing');save()}; el.onpointerup=end;el.onlostpointercapture=end;
  }
  dragDivider('pane-divider',e=>{const box=$('editors').getBoundingClientRect();preferences.ratio=Math.max(25,Math.min(75,100*(e.clientX-box.left)/box.width))});
  dragDivider('monitor-divider',e=>{const box=$('monitor').getBoundingClientRect();preferences.monitorHeight=Math.max(100,Math.min(innerHeight*.4,box.bottom-e.clientY));preferences.collapsed=false});
  $('pane-divider').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();preferences.ratio=Math.max(25,Math.min(75,preferences.ratio+(e.key==='ArrowRight'?3:-3)));apply()}};
  $('monitor-divider').onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();preferences.monitorHeight=Math.max(100,Math.min(300,preferences.monitorHeight+(e.key==='ArrowUp'?20:-20)));apply()}};
  const observer=new ResizeObserver(()=>requestAnimationFrame(resize));observer.observe($('blockly'));
  const zoomLabel=()=>{$('zoom-level').textContent=Math.round(workspace.scale*100)+'%'};
  for(const [id,action] of Object.entries({'zoom-fit':()=>workspace.zoomToFit(),'zoom-center':()=>workspace.scrollCenter(),'zoom-in':()=>workspace.zoomCenter(1),'zoom-out':()=>workspace.zoomCenter(-1)})) $(id).onclick=()=>{action();zoomLabel()};
  workspace.addChangeListener(zoomLabel);
  const groups=[
    {name:'Chương trình',color:'#d9951b',symbol:'blocks',blocks:['robot_setup','robot_loop','robot_repeat','robot_wait'],search:'setup loop repeat wait chờ lặp khởi động'},
    {name:'GPIO & cảm biến',color:'#2689ee',symbol:'usb',blocks:['device_write','device_read','device_if'],search:'led gpio adc input output sensor nếu đọc cảm biến'},
    {name:'PWM',color:'#ed5978',symbol:'play',blocks:['device_pwm'],search:'pwm duty tốc độ'},
    {name:'Servo',color:'#8e64db',symbol:'settings',blocks:['device_servo','device_servo_release'],search:'servo angle góc'},
    {name:'Động cơ',color:'#4fa775',symbol:'settings',blocks:['device_motor','device_motor_stop'],search:'motor động cơ in1 in2'},
    {name:'Serial',color:'#e9ac2d',symbol:'terminal',blocks:['robot_print','device_read'],search:'serial print gửi đọc'},
  ];
  let activeCategory=-1;
  const flyout = workspace.getFlyout();
  function showGroup(index:number) {
    if ($('blockly').inert) return;
    if(activeCategory===index && flyout?.isVisible()){flyout.hide();activeCategory=-1}
    else {flyout?.show(groups[index].blocks.map(type=>({kind:'block',type})));if(flyout)localizeBlocks(flyout.getWorkspace());activeCategory=index}
    document.querySelectorAll('.category-button').forEach((button,i)=>button.classList.toggle('active',i===activeCategory));
  }
  groups.forEach((group,index)=>{
    const button=document.createElement('button'); button.className='category-button'; button.dataset.category=String(index); button.style.setProperty('--category-color',group.color);
    button.innerHTML=`<span class="category-icon">${icon(group.symbol)}</span><span class="category-label"></span>`;
    button.querySelector('span:last-child')!.textContent=group.name;button.title=group.name;button.onclick=()=>showGroup(index);$('block-categories').append(button);
  });
  const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
  $<HTMLInputElement>('block-search').oninput=()=>{
    const query=normalize($<HTMLInputElement>('block-search').value.trim()); let found=0;
    groups.forEach((group,i)=>{const match=normalize(group.search+' '+group.name+' '+t(group.name)).includes(query);($('block-categories').children[i] as HTMLElement).hidden=!match;if(match)found++});
    $('search-empty').hidden=found>0;
    if(query){const types=groups.filter(g=>normalize(g.search+' '+g.name+' '+t(g.name)).includes(query)).flatMap(g=>g.blocks);if(types.length&&!$('blockly').inert)flyout?.show([...new Set(types)].map(type=>({kind:'block',type})));else flyout?.hide()}
    else flyout?.hide();
  };
  const showDialog=(id:string)=>{const dialog=$<HTMLDialogElement>(id); if(!dialog.open)dialog.showModal()};
  $('project-menu').onclick=()=>showDialog('project-dialog');$('new-project').onclick=()=>showDialog('project-dialog');
  $('settings').onclick=()=>showDialog('settings-dialog');$('help').onclick=()=>showDialog('help-dialog');
  document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button=>button.onclick=()=>$<HTMLDialogElement>(button.dataset.close!).close());
  $('account').onclick=()=>{$('info-title').textContent=t('Tài khoản');$('info-text').textContent=t('Chưa đăng nhập. Tính năng tài khoản sẽ có trong phiên bản sau.');showDialog('info-dialog')};
  $('ai-tutor').onclick=()=>{$('info-title').textContent='AI Tutor';$('info-text').textContent=t('AI Tutor sẽ có trong phiên bản sau.');showDialog('info-dialog')};
  $('notice').onclick=()=>{$('notice').hidden=true};
  $('copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(code.value);notify('Đã sao chép C++.')}catch{notify('Không sao chép được. Hãy chọn và sao chép văn bản trong vùng code.',true)}};
  const syncScroll=()=>{$('code-render').scrollTop=code.scrollTop;$('code-render').scrollLeft=code.scrollLeft;$('line-numbers').style.transform=`translateY(${-code.scrollTop}px)`};
  function renderCode(){ $('code-render').innerHTML=highlightCpp(code.value);$('line-numbers').textContent=Array.from({length:code.value.split('\n').length},(_,i)=>String(i+1)).join('\n');syncScroll() }
  code.addEventListener('input',renderCode);code.addEventListener('scroll',syncScroll);
  code.addEventListener('keydown',event=>{if(event.key==='Tab'&&!code.readOnly){event.preventDefault();code.setRangeText('  ',code.selectionStart,code.selectionEnd,'end');code.dispatchEvent(new Event('input',{bubbles:true}))}});
  onLocaleChange(()=>{groups.forEach((g,i)=>{const button=$('block-categories').children[i] as HTMLElement;button.title=t(g.name)});localizeBlocks(workspace);if(flyout)localizeBlocks(flyout.getWorkspace())});
  workspace.addChangeListener(event=>{if(event.type===Blockly.Events.BLOCK_CREATE)localizeBlocks(workspace)});
  showMonitor(monitorTab,false);apply();zoomLabel();renderCode();
  return {setFocus,showMonitor,renderCode,showDialog,resize};
}
