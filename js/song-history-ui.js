const byId=id=>document.getElementById(id);
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function fmt(v,d=1){const n=Number(v);return Number.isFinite(n)?n.toFixed(d):'—';}
function inject(){
 if(byId('songHistoryCard'))return;
 const saved=byId('sessionCount')?.closest('.card.section'); if(!saved)return;
 const s=document.createElement('section');s.className='card section';s.id='songHistoryCard';
 s.innerHTML='<div class="section-head"><span>Song history</span><span class="subtle" id="songHistoryStatus">Local only</span></div><p class="v12-copy">Saved structured analyses stay on this device. Open a song to review versions, notes, evidence, and guarded A/B comparisons.</p><div id="songHistoryList" class="snapshot-list"></div>';
 saved.insertAdjacentElement('beforebegin',s);
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
   actions.children[0].onclick=async()=>{const l=history.at(-2),r=history.at(-1),res=await AcelynnCoreLoop.compareVersions(song.id,l.version.id,r.version.id);const parts=Object.entries(res.diff.bands).map(([k,x])=>x.classification==='comparable'?k+' '+(x.delta>=0?'+':'')+fmt(x.delta)+' dB':k+' '+(x.direction||'—')+' ('+x.classification+')');byId('coachTitle').textContent='Version comparison';byId('coachText').textContent=res.summary+' '+parts.join(' · ');const advice=byId('advice');if(advice){advice.innerHTML='';for(const item of res.guidance||[]){const el=document.createElement('div');el.className='advice-item';const b=document.createElement('b');b.textContent=item.band[0].toUpperCase()+item.band.slice(1)+'. ';el.appendChild(b);el.appendChild(document.createTextNode(item.text));advice.appendChild(el);}}};
   actions.children[1].onclick=async()=>{const latest=history.at(-1).analysis;if(!latest)return;const note=globalThis.prompt?.('Add a note about this version:',latest.userNote||'');if(note===null||note===undefined)return;await AcelynnCoreLoop.updateAnalysisNote(latest.id,note);await render();};
   card.appendChild(actions);
  }
  root.appendChild(card);
 }
 if(!root.children.length)root.innerHTML='<div class="subtle">Save an analysis to start local song history.</div>';
}
async function init(){inject();await render();window.addEventListener('acelynn:snapshot-saved',()=>setTimeout(render,50));}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else queueMicrotask(init);}
