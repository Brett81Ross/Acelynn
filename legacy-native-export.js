(()=>{
  const NATIVE_UA='CactusByteNative/1.0';
  const ENDPOINT='/api/native-backup-download';
  const MAX_SNAPSHOTS=12;

  if(!navigator.userAgent.includes(NATIVE_UA))return;

  const button=document.getElementById('exportButton');
  if(!button)return;

  function encodeBase64Url(text){
    const bytes=new TextEncoder().encode(text);
    let binary='';
    const chunk=0x4000;
    for(let i=0;i<bytes.length;i+=chunk){
      binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+chunk)));
    }
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function readSnapshots(){
    let value=[];
    try{value=JSON.parse(localStorage.getItem('acelynn-snapshots')||'[]')}catch(_){value=[]}
    if(!Array.isArray(value))value=[];
    return value.slice(-MAX_SNAPSHOTS);
  }

  function setStatus(message){
    const status=document.getElementById('status');
    if(status)status.textContent=message;
  }

  button.addEventListener('click',event=>{
    event.preventDefault();
    event.stopImmediatePropagation();

    const snapshots=readSnapshots();
    if(!snapshots.length){
      setStatus('Save a check before exporting');
      return;
    }

    const payload={app:'Acelynn Pro',created:new Date().toISOString(),snapshots};
    const encoded=encodeBase64Url(JSON.stringify(payload));
    const url=new URL(ENDPOINT,location.origin);
    url.searchParams.set('d',encoded);

    setStatus('Opening Android backup download…');
    const anchor=document.createElement('a');
    anchor.href=url.toString();
    anchor.download='acelynn-session-report.json';
    anchor.rel='noopener noreferrer';
    anchor.style.display='none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  },true);
})();
