import { t, onLocaleChange } from './i18n';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
interface Port { readable: ReadableStream<Uint8Array>|null; writable?: WritableStream<Uint8Array>|null; open(options:{baudRate:number}):Promise<void>; close():Promise<void> }
export class SerialMonitor {
  private port: Port|null=null;
  private reader: ReadableStreamDefaultReader<Uint8Array>|null=null;
  private reading: Promise<void>|null=null;
  private connecting=false; private disconnecting=false; private paused=false; private log='';
  constructor(private notify:(message:string,error?:boolean)=>void,private show:()=>void){
    $('serial-connect').onclick=()=>void this.toggle();
    $('serial-clear').onclick=()=>{this.log='';this.render()};
    $('serial-pause').onclick=()=>{this.paused=!this.paused;$('serial-pause').setAttribute('aria-pressed',String(this.paused));if(!this.paused)this.render()};
    $('serial-save').onclick=()=>{const url=URL.createObjectURL(new Blob([this.log],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='espstudio-serial.log';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
    $<HTMLFormElement>('serial-send-form').onsubmit=e=>{e.preventDefault();void this.send()};
    onLocaleChange(()=>{this.status();if(!this.log)this.render()});this.status();
  }
  private render(){if(this.paused)return;$('serial-log').textContent=this.log||t('Chưa có dữ liệu.');if($<HTMLInputElement>('serial-autoscroll').checked)$('serial-log').scrollTop=$('serial-log').scrollHeight}
  private status(){
    $('serial-connect-label').textContent=t(this.connecting?'Đang kết nối…':this.port?'Ngắt kết nối':'Kết nối');
    $('usb-state').querySelector('span')!.textContent=t(this.port?'Serial đã kết nối':this.connecting?'Đang kết nối…':'Chưa kết nối');
    $('usb-state').classList.toggle('connected',!!this.port);
    $<HTMLButtonElement>('serial-connect').disabled=this.connecting||this.disconnecting;
    $<HTMLSelectElement>('serial-baud').disabled=!!this.port||this.connecting;
    $<HTMLButtonElement>('serial-send').disabled=!this.port?.writable;
  }
  private async toggle(){
    if(this.port){await this.disconnect();return}if(this.connecting)return;
    const api=(navigator as Navigator & {serial?:{requestPort():Promise<Port>}}).serial;
    if(!api){this.notify('Trình duyệt chưa hỗ trợ Web Serial. Hãy dùng Chrome/Edge trên máy tính.',true);return}
    this.connecting=true;this.status();let selected:Port|null=null;
    try{
      selected=await api.requestPort();await selected.open({baudRate:Number($<HTMLSelectElement>('serial-baud').value)});
      if(!selected.readable)throw new Error(t('Cổng Serial không có luồng đọc.'));
      this.port=selected;this.reader=selected.readable.getReader();this.show();
      const reader=this.reader;const port=selected;
      this.reading=(async()=>{
        const decoder=new TextDecoder();
        try{while(true){const {value,done}=await reader.read();if(done)break;this.log=(this.log+decoder.decode(value,{stream:true})).slice(-40000);this.render()}}
        catch(error){if(!this.disconnecting){this.log+='\n'+t('Mất kết nối Serial.')+' '+String(error);this.render();this.notify('Mất kết nối Serial. Hãy kiểm tra USB và kết nối lại.',true)}}
        finally{reader.releaseLock();this.reader=null;if(!this.disconnecting){try{await port.close()}catch{/* Already detached. */}this.port=null;this.status()}}
      })();
    }catch(error){if(selected){try{await selected.close()}catch{/* Not open. */}}if((error as DOMException).name!=='NotFoundError')this.notify(String((error as Error).message??error),true)}
    finally{this.connecting=false;this.status()}
  }
  async disconnect(){
    if(this.connecting)throw new Error(t('Chờ kết nối Serial hoàn tất trước khi nạp.'));
    this.disconnecting=true;this.status();
    try{if(this.reader)await this.reader.cancel();if(this.reading)await this.reading;if(this.port)await this.port.close();this.port=null;this.reading=null}
    finally{this.disconnecting=false;this.status()}
  }
  private async send(){
    const writable=this.port?.writable;if(!writable)return;const writer=writable.getWriter();
    try{await writer.write(new TextEncoder().encode($<HTMLInputElement>('serial-command').value+'\n'));$<HTMLInputElement>('serial-command').value=''}
    catch(error){this.notify(t('Không gửi được lệnh Serial.')+' '+String(error),true)}finally{writer.releaseLock()}
  }
}
