import { t, onLocaleChange } from './i18n';
import type { UsbIdentity } from './device-port';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
interface Port {
  connected?: boolean;
  readable: ReadableStream<Uint8Array>|null;
  writable?: WritableStream<Uint8Array>|null;
  getInfo(): UsbIdentity;
  open(options:{baudRate:number}):Promise<void>;
  close():Promise<void>;
}
export class SerialMonitor {
  private selected: Port|null=null;
  private port: Port|null=null;
  private reader: ReadableStreamDefaultReader<Uint8Array>|null=null;
  private reading: Promise<void>|null=null;
  private connecting=false; private disconnecting=false; private suspended=false; private locked=false;
  private paused=false; private log=''; private label='';
  revision=0;
  get info(): UsbIdentity|null { return this.selected?.getInfo() ?? null; }
  constructor(private notify:(message:string,error?:boolean)=>void,private show:()=>void,private changed:()=>void){
    $('serial-connect').onclick=()=>void this.choose();
    $('serial-disconnect').onclick=()=>void this.disconnect().catch(error=>this.notify(String(error),true));
    $('serial-clear').onclick=()=>{this.log='';this.render()};
    $('serial-pause').onclick=()=>{this.paused=!this.paused;$('serial-pause').setAttribute('aria-pressed',String(this.paused));if(!this.paused)this.render()};
    $('serial-save').onclick=()=>{const url=URL.createObjectURL(new Blob([this.log],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='espstudio-serial.log';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
    $<HTMLFormElement>('serial-send-form').onsubmit=e=>{e.preventDefault();void this.send()};
    (navigator as any).serial?.addEventListener?.('disconnect',(event:Event)=>{
      if(event.target===this.selected&&!this.suspended){if(this.locked)void this.disconnect().catch(()=>this.clearSelection());else void this.recover();}
    });
    onLocaleChange(()=>{this.status();if(!this.log)this.render()});this.status();
  }
  setLabel(label:string){this.label=label;this.status()}
  setLocked(locked:boolean){this.locked=locked;this.status()}
  private render(){if(this.paused)return;$('serial-log').textContent=this.log||t('Chưa có dữ liệu.');if($<HTMLInputElement>('serial-autoscroll').checked)$('serial-log').scrollTop=$('serial-log').scrollHeight}
  private status(){
    const info=this.info;
    const usb=info?.usbVendorId!==undefined&&info.usbProductId!==undefined?`USB ${info.usbVendorId.toString(16).padStart(4,'0')}:${info.usbProductId.toString(16).padStart(4,'0')}`:t('Thiết bị Serial');
    $('serial-connect-label').textContent=this.connecting?t('Đang kết nối…'):this.selected?(this.label||usb):t('Chọn thiết bị');
    $('serial-connect').classList.toggle('connected',!!this.selected);
    $('serial-connect').setAttribute('aria-pressed',String(!!this.selected));
    $('serial-connect').title=this.selected?`${this.label||usb} · ${t(this.suspended?'Serial tạm đóng để nạp':'Bấm để chọn thiết bị khác')}`:t('Chọn thiết bị');
    $<HTMLButtonElement>('serial-connect').disabled=this.connecting||this.disconnecting||this.locked;
    $<HTMLButtonElement>('serial-disconnect').disabled=!this.selected||this.connecting||this.disconnecting||this.locked;
    $<HTMLSelectElement>('serial-baud').disabled=!!this.port||this.connecting;
    $<HTMLButtonElement>('serial-send').disabled=!this.port?.writable;
  }
  private clearSelection(){this.selected=null;this.label='';this.revision++;this.status();this.changed()}
  private async choose(){
    if(this.connecting||this.locked)return;
    const api=(navigator as Navigator & {serial?:{requestPort():Promise<Port>}}).serial;
    if(!api){this.notify('Trình duyệt chưa hỗ trợ Web Serial. Hãy dùng Chrome/Edge trên máy tính.',true);return}
    this.connecting=true;this.status();
    try {
      // Invoke the browser picker directly in the click gesture, before any Agent request.
      const selected=await api.requestPort();
      if(selected===this.selected&&this.port){this.revision++;this.changed();return}
      await this.closePort();this.clearSelection();
      this.selected=selected;
      try{await this.openPort(selected)}catch(error){this.clearSelection();throw error}
      this.revision++;this.show();this.changed();
    }catch(error){if((error as DOMException).name!=='NotFoundError')this.notify(String((error as Error).message??error),true)}
    finally{this.connecting=false;this.status()}
  }
  private async openPort(selected:Port){
    await selected.open({baudRate:Number($<HTMLSelectElement>('serial-baud').value)});
    try { if(!selected.readable)throw new Error(t('Cổng Serial không có luồng đọc.'));this.reader=selected.readable.getReader(); }
    catch(error){await selected.close().catch(()=>{});throw error}
    this.port=selected;const reader=this.reader;
    this.reading=(async()=>{
      const decoder=new TextDecoder();
      try{while(true){const {value,done}=await reader.read();if(done)break;this.log=(this.log+decoder.decode(value,{stream:true})).slice(-40000);this.render()}}
      catch(error){if(!this.disconnecting&&!this.suspended){this.log+='\n'+t('Mất kết nối Serial.')+' '+String(error);this.render()}}
      finally{reader.releaseLock();this.reader=null;if(!this.disconnecting){try{await selected.close()}catch{/* Detached. */}this.port=null;if(!this.suspended){if(this.locked)this.clearSelection();else setTimeout(()=>void this.recover(),0)}}}
    })();
  }
  private async closePort(bestEffort=false){
    this.disconnecting=true;this.status();
    try{if(this.reader)await this.reader.cancel();if(this.reading)await this.reading;if(this.port)await this.port.close();this.port=null;this.reading=null}
    catch(error){if(!bestEffort)throw error}
    finally{this.port=null;this.reading=null;this.disconnecting=false;this.status()}
  }
  async disconnect(){await this.closePort();this.clearSelection()}
  async suspend(){
    if(this.connecting)throw new Error(t('Chờ kết nối Serial hoàn tất trước khi nạp.'));
    this.suspended=true;await this.closePort();this.status();
  }
  async resume(){
    if(!this.suspended)return false;
    return this.recover();
  }
  private async recover():Promise<boolean>{
    if(this.connecting||!this.selected)return false;
    this.connecting=true;this.suspended=true;this.status();
    const original=this.selected, identity=original.getInfo();
    const api=(navigator as Navigator & {serial?:{getPorts?():Promise<Port[]>}}).serial;
    try{
      await this.closePort(true);
      const deadline=Date.now()+12000;
      while(Date.now()<deadline){
        // Never request new permission or substitute an arbitrary USB device.
        const granted=api?.getPorts?await api.getPorts():[original];
        const candidates=granted.filter(port=>{
          if(port.connected===false)return false;
          const info=port.getInfo();
          return identity.usbVendorId!==undefined&&identity.usbProductId!==undefined
            ? info.usbVendorId===identity.usbVendorId&&info.usbProductId===identity.usbProductId : port===original;
        });
        if(candidates.length>1)throw new Error('Có nhiều cổng cùng loại đã được cấp quyền. Bấm Chọn thiết bị để xác định đúng board.');
        if(candidates.length===1){
          try{
            this.selected=candidates[0];await this.openPort(candidates[0]);
            // CDC may disappear once more while Windows completes enumeration.
            await new Promise(resolve=>setTimeout(resolve,350));
            if(this.port){this.revision++;this.label='';this.changed();return true;}
          }catch{/* Windows may still be replacing the old COM handle. */}
        }
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      throw new Error('Chưa tìm lại được cổng Serial đã cấp quyền. Nếu board đang chạy, bấm Chọn thiết bị một lần để cấp quyền cho cổng USB mới.');
    }catch(error){this.clearSelection();this.notify(String((error as Error).message??error),true);return false}
    finally{this.connecting=false;this.suspended=false;this.status()}
  }
  private async send(){
    const writable=this.port?.writable;if(!writable)return;
    let writer:WritableStreamDefaultWriter<Uint8Array>|undefined;
    try{writer=writable.getWriter();await writer.write(new TextEncoder().encode($<HTMLInputElement>('serial-command').value+'\n'));$<HTMLInputElement>('serial-command').value=''}
    catch(error){this.notify(t('Không gửi được lệnh Serial.')+' '+String(error),true)}finally{writer?.releaseLock()}
  }
}
