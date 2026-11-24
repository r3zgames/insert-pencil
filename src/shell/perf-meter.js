'use strict';
// Frame meter for profiling on phones and tablets: only when the address carries ?perf (or #perf for the single file).
// A corner card shows the last second's frame rate, slow frames and, where the browser reports it, memory; each scene
// (the locker, the comic, a page or a game) keeps its own frame times, and "copy report" puts a short text summary on
// the clipboard (shown in a box to select by hand where the clipboard is refused). It sends nothing anywhere and is
// never shown to players who did not ask for it.
(function(g){
const on=/[?&#]perf\b/.test(g.location.search+g.location.hash);
if(!on)return;
const started=performance.now(),scenes=new Map(),deltas=[];let last=0,cur=null;
const scene=()=>{const n=g.No2;if(!n)return'start';if(n.intro?.active)return'comic';if(n.selected)return n.selected+':'+(n.page||'?');const d=document.getElementById('desk-dialog');return d?.open?'page:'+(d.dataset.screen||'?'):'locker'};
const box=document.createElement('div');box.id='perf-meter';
box.style.cssText='position:fixed;right:max(8px,env(safe-area-inset-right));top:max(8px,env(safe-area-inset-top));z-index:2147483647;background:rgba(10,12,20,.82);color:#e8f0ff;font:12px/1.35 ui-monospace,Menlo,monospace;padding:6px 8px;border-radius:6px;pointer-events:auto;white-space:pre;max-width:46vw';
const text=document.createElement('div'),btn=document.createElement('button');
btn.textContent='copy report';btn.style.cssText='margin-top:4px;font:inherit;background:#2b3a66;color:#fff;border:0;border-radius:4px;padding:3px 6px';
box.append(text,btn);
const stats=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),q=p=>s[Math.min(s.length-1,Math.floor(s.length*p))];
 const tot=a.reduce((x,y)=>x+y,0);return{frames:a.length,fps:+(a.length/(tot/1000)).toFixed(1),p50:+q(.5).toFixed(1),p95:+q(.95).toFixed(1),p99:+q(.99).toFixed(1),worst:+s[s.length-1].toFixed(1),over20:a.filter(x=>x>20).length,over33:a.filter(x=>x>33.4).length,over100:a.filter(x=>x>100).length,seconds:+(tot/1000).toFixed(1)}};
const mem=()=>{const m=performance.memory;return m?Math.round(m.usedJSHeapSize/1048576)+' MB':'n/a'};
function report(){const lines=[`No. 2 Arcade ${g.No2?.version||''} frame report`,`${navigator.userAgent}`,`screen ${screen.width}x${screen.height} @${devicePixelRatio}x, window ${innerWidth}x${innerHeight}, ${Math.round((performance.now()-started)/1000)} s`,'scene: frames fps p50/p95/p99/worst ms, slow >20/>33/>100 ms'];
 for(const[k,a]of scenes){const s=stats(a);if(s&&s.frames>30)lines.push(`${k}: ${s.frames} ${s.fps} ${s.p50}/${s.p95}/${s.p99}/${s.worst} slow ${s.over20}/${s.over33}/${s.over100} (${s.seconds} s)`)}
 return lines.join('\n')}
btn.onclick=async e=>{e.stopPropagation();const r=report();try{await navigator.clipboard.writeText(r);btn.textContent='copied'}catch{const t=document.createElement('textarea');t.value=r;t.style.cssText='display:block;width:44vw;height:30vh;margin-top:4px;font:inherit';box.append(t);t.focus();t.select();btn.textContent='select the text'}setTimeout(()=>btn.textContent='copy report',1500)};
for(const ev of['pointerdown','touchstart','keydown'])box.addEventListener(ev,e=>e.stopPropagation());
function frame(t){if(last){const d=t-last;if(!document.hidden&&d<1000){const k=scene();if(k!==cur){cur=k;deltas.length=0}let a=scenes.get(k);if(!a)scenes.set(k,a=[]);if(a.length<20000)a.push(d);deltas.push(d);while(deltas.length&&deltas.reduce((x,y)=>x+y,0)>1000)deltas.shift()}}
 last=t;requestAnimationFrame(frame)}
setInterval(()=>{const s=stats(deltas);text.textContent=`${cur||''}\n${s?`${s.fps} fps  p95 ${s.p95} ms\nslow ${s.over20}/${s.over33}  worst ${s.worst} ms`:'...'}\nheap ${mem()}`},500);
const add=()=>{document.body.append(box);requestAnimationFrame(frame)};
document.body?add():addEventListener('DOMContentLoaded',add);
g.No2Perf={report,scenes};
})(globalThis);
