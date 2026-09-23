const byId=id=>document.getElementById(id);
const BAND_ORDER=['sub','bass','mids','presence','air'];
const BAND_NAMES={sub:'Sub',bass:'Bass',mids:'Mids',presence:'Presence',air:'Air'};
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function fmt(v,d=1){const n=Number(v);return Number.isFinite(n)?n.toFixed(d):'—';}
function inject(){
 if(byId('songHistoryCard'))return;
 const saved=byId('sessionCount')?.closest('.card.section'); if(!saved)return;
 const s=document.createElement('section');s.className='card section';s.id='songHistoryCard';
 s.innerHTML='<div class="section-head"><span>Song history</span><span class="subtle" id="songHistoryStatus">Local only</span></div><p class="v12-copy">Saved structured analyses stay on this device. Open a song to review versions, notes, evidence, and guarded A/B comparisons.</p><div id="songHistoryList" class="snapshot-list"></div>';
 saved.insertAdjacentElement('beforebegin',s);
}
function comparisonPanel(res){
 const panel=document.createElement('div');panel.className='comparison-panel';
 const head=document.createElement('div');head.className='comparison-summary';head.textContent=res.summary;panel.appendChild(head);
 for(const warning of res.diff.warnings||[]){const w=document.createElement('div');w.className='comparison-warning';w.textContent=warning;panel.appendChild(w);}
 const grid=document.createElement('div');grid.className='comparison-band-grid';
 for(const key of BAND_ORDER){
  const x=res.diff.bands[key],row=document.createElement('div');row.className='comparison-band-row';
  const state=x.classification==='comparable'?'Comparable':x.classification==='direction-only'?'Direction only':'Suppressed';
  const value=x.classification==='comparable'&&Number.isFinite(x.delta)?(x.delta>=0?'+':'')+fmt(x.delta)+' dB':x.classification==='direction-only'?(x.direction||'≈')+' · magnitude suppressed':'Not reliable';
  row.innerHTML='<div><strong>'+BAND_NAMES[key]+'</strong><small>'+state+'</small></div><b>'+esc(value)+'</b>';
  if(x.reasons?.length){const why=document.createElement('p');why.textContent=x.reasons.join(' · ');row.appendChild(why);}
  grid.appendChild(row);
 }
 panel.appendChild(grid);
 const guidance=document.createElement('div');guidance.className='comparison-guidance';
 for(const item of res.guidance||[]){const el=document.createElement('div');el.className='advice-item';const b=document.createElement('b');b.textContent=BAND_NAMES[item.band]+'. ';el.appendChild(b);el.appendChild(document.createTextNode(item.text));guidance.appendChild(el);}
 panel.appendChild(guidance);return panel;
}
async function render(){
 const root=byId('songHistoryList');if(!root||!globalThis.AcelynnCoreLoop)return;
 const songs=await AcelynnCoreLoop.listSongs();root.innerHTML='';
 for(const song of songs){
  const history=await AcelynnCoreLoop.listSongHistory(song.id); if(!history.length)continue;
  const card=document.createElement('div');card.className='snapshot-details';
  card.innerHTML='<div class="snapshot-detail-head"><div><b>'+esc(song.name)+'</b><div>'+history.length+' version'+(history.length===1?'':'s')+'</div></div></div><div class="snapshot-band-list"></div>';
  const list=card.querySelector('.snapshot-band-list');
  for(const item of history.slice().reverse()){
   const a=item.analysis,v=item.version,row=document.createElement('div');row.className='snapshot-detail-item';
   const coaching=a?.coachingFindings?.[0]; row.innerHTML='<small>'+esc(v.label)+'</small><strong>Balance '+fmt(a?.balance?.score,0)+'/100 · '+esc(a?.balance?.leadingRegion||'No leading region')+'</strong><div class="v12-copy">'+esc(v.note||a?.userNote||coaching?.title||'No note yet')+'</div>';
   list.appendChild(row);
  }
  const rename=document.createElement('div');rename.className='snapshot-detail-actions';rename.innerHTML='<button type="button" style="grid-column:1/-1">Rename song</button>';rename.firstChild.onclick=async()=>{const title=globalThis.prompt?.('Song name:',song.name||'');if(!title)return;await AcelynnCoreLoop.renameSong(song.id,title);await render();};card.appendChild(rename);
  if(history.length>=2){
   const actions=document.createElement('div');actions.className='snapshot-detail-actions';actions.innerHTML='<button type="button">Compare latest two</button><button type="button">Add note to latest</button>';
   actions.children[0].onclick=async()=>{const l=history.at(-2),r=history.at(-1),res=await AcelynnCoreLoop.compareVersions(song.id,l.version.id,r.version.id);card.querySelector('.comparison-panel')?.remove();card.appendChild(comparisonPanel(res));};
   actions.children[1].onclick=async()=>{const latest=history.at(-1).analysis;if(!latest)return;const note=globalThis.prompt?.('Add a note about this version:',latest.userNote||'');if(note===null||note===undefined)return;await AcelynnCoreLoop.updateAnalysisNote(latest.id,note);await render();};
   card.appendChild(actions);
  }
  root.appendChild(card);
 }
 if(!root.children.length)root.innerHTML='<div class="subtle">Save an analysis to start local song history.</div>';
}
async function init(){inject();await render();window.addEventListener('acelynn:snapshot-saved',()=>setTimeout(render,50));}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else queueMicrotask(init);}
