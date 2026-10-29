import { Blockly } from '../blocks';

export function initWhiteboard(workspace: Blockly.WorkspaceSvg) {
  const host = document.getElementById('blockly')!;
  const canvas = document.getElementById('workspace-minimap') as HTMLCanvasElement;
  const context = canvas.getContext('2d')!;
  let transform = { x: 0, y: 0, scale: 1 };
  let queued = false;
  function draw() {
    queued = false;
    if (!host.clientWidth || !host.clientHeight) return;
    const metrics = workspace.getMetrics(); const zoom = workspace.scale;
    const viewport = { x: metrics.viewLeft / zoom, y: metrics.viewTop / zoom, width: metrics.viewWidth / zoom, height: metrics.viewHeight / zoom };
    const blocks = workspace.getAllBlocks(false).map(block => {
      const position = block.getRelativeToSurfaceXY();
      const shape = block.getSvgRoot()?.querySelector<SVGPathElement>('.blocklyPath')?.getBBox();
      return { x: position.x, y: position.y, width: shape?.width ?? 20, height: shape?.height ?? 20, color: block.getColour() };
    });
    const left = Math.min(viewport.x, ...blocks.map(b=>b.x))-30;
    const top = Math.min(viewport.y, ...blocks.map(b=>b.y))-30;
    const right = Math.max(viewport.x+viewport.width, ...blocks.map(b=>b.x+b.width))+30;
    const bottom = Math.max(viewport.y+viewport.height, ...blocks.map(b=>b.y+b.height))+30;
    const scale = Math.min(canvas.width/(right-left),canvas.height/(bottom-top));
    transform = {x:left-(canvas.width/scale-(right-left))/2,y:top-(canvas.height/scale-(bottom-top))/2,scale};
    context.clearRect(0,0,canvas.width,canvas.height);context.fillStyle='#f5f9fa';context.fillRect(0,0,canvas.width,canvas.height);
    for(const b of blocks){context.fillStyle=b.color;context.fillRect((b.x-transform.x)*scale,(b.y-transform.y)*scale,Math.max(2,b.width*scale),Math.max(2,b.height*scale))}
    context.fillStyle='#259bba18';context.strokeStyle='#1685a4';context.lineWidth=1.5;
    const rect=[(viewport.x-transform.x)*scale,(viewport.y-transform.y)*scale,viewport.width*scale,viewport.height*scale] as const;
    context.fillRect(...rect);context.strokeRect(...rect);
    canvas.dataset.zoom=String(zoom);canvas.dataset.scroll=`${workspace.scrollX},${workspace.scrollY}`;
  }
  const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(draw)}};
  workspace.addChangeListener(schedule);new ResizeObserver(schedule).observe(host);
  let zoomFrame = 0, targetZoom = workspace.scale, previousTime = 0;
  let anchor = {x:0,y:0};
  const cancelZoom=()=>{if(zoomFrame)cancelAnimationFrame(zoomFrame);zoomFrame=0;targetZoom=workspace.scale};
  const zoomAt=(scale:number)=>{
    const speed=workspace.options.zoomOptions.scaleSpeed;
    workspace.zoom(anchor.x,anchor.y,Math.log(scale/workspace.scale)/Math.log(speed));schedule();
  };
  const animateZoom=(now:number)=>{
    const dt=Math.min(40,Math.max(1,now-previousTime));previousTime=now;
    const next=workspace.scale+(targetZoom-workspace.scale)*(1-Math.exp(-dt/55));
    if(Math.abs(next-targetZoom)<0.0005){zoomAt(targetZoom);zoomFrame=0;return}
    zoomAt(next);zoomFrame=requestAnimationFrame(animateZoom);
  };
  host.addEventListener('wheel',event=>{
    // Flyout wheel remains scrolling; number/text editors keep their own handling.
    if(host.inert||(event.target as Element).closest('.blocklyFlyout,input,textarea'))return;
    event.preventDefault();event.stopImmediatePropagation();
    const bounds=workspace.getParentSvg().getBoundingClientRect();
    anchor={x:event.clientX-bounds.left,y:event.clientY-bounds.top};
    const unit=event.deltaMode===1?16:event.deltaMode===2?host.clientHeight:1;
    const delta=Math.max(-240,Math.min(240,event.deltaY*unit));
    if(!zoomFrame)targetZoom=workspace.scale;
    targetZoom=Math.max(.4,Math.min(4,targetZoom*Math.exp(-delta*.0014)));
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){zoomAt(targetZoom);return}
    if(!zoomFrame){previousTime=performance.now();zoomFrame=requestAnimationFrame(animateZoom)}
  },{capture:true,passive:false});
  document.addEventListener('pointerdown',cancelZoom,true);
  window.addEventListener('blur',cancelZoom);
  // Viewport changes do not alter project blocks, fields or source ownership.
  let pan: {id:number;x:number;y:number;scrollX:number;scrollY:number}|null=null;
  host.addEventListener('pointerdown',event=>{
    if(event.button!==1||host.inert)return;
    event.preventDefault();event.stopImmediatePropagation();
    pan={id:event.pointerId,x:event.clientX,y:event.clientY,scrollX:workspace.scrollX,scrollY:workspace.scrollY};
    host.setPointerCapture(event.pointerId);host.classList.add('panning');
  },true);
  host.addEventListener('pointermove',event=>{
    if(!pan||event.pointerId!==pan.id)return;event.preventDefault();event.stopImmediatePropagation();
    workspace.scroll(pan.scrollX+event.clientX-pan.x,pan.scrollY+event.clientY-pan.y);schedule();
  },true);
  const end=()=>{pan=null;host.classList.remove('panning')};
  host.addEventListener('pointerup',event=>{if(pan){event.preventDefault();event.stopImmediatePropagation();end()}},true);
  host.addEventListener('lostpointercapture',end);
  host.addEventListener('auxclick',event=>{if(event.button===1){event.preventDefault();event.stopImmediatePropagation()}},true);
  const navigate=(event:PointerEvent)=>{
    const bounds=canvas.getBoundingClientRect();const metrics=workspace.getMetrics();
    const x=transform.x+(event.clientX-bounds.left)*canvas.width/bounds.width/transform.scale;
    const y=transform.y+(event.clientY-bounds.top)*canvas.height/bounds.height/transform.scale;
    workspace.scroll(metrics.viewWidth/2-x*workspace.scale,metrics.viewHeight/2-y*workspace.scale);schedule();
  };
  canvas.onpointerdown=event=>{if(event.button!==0||host.inert)return;event.preventDefault();canvas.setPointerCapture(event.pointerId);navigate(event)};
  canvas.onpointermove=event=>{if(canvas.hasPointerCapture(event.pointerId))navigate(event)};
  canvas.onkeydown=event=>{const directions:Record<string,[number,number]>={ArrowLeft:[80,0],ArrowRight:[-80,0],ArrowUp:[0,80],ArrowDown:[0,-80]};if(directions[event.key]&&!host.inert){event.preventDefault();const [x,y]=directions[event.key];workspace.scroll(workspace.scrollX+x,workspace.scrollY+y);schedule()}};
  schedule();
}
