(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.AcelynnRecovery=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const APP="Acelynn Pro";
  const SCHEMA="acelynn-pro-backup-v1";
  const VERSION=1;
  const STORAGE_KEY="acelynn-snapshots";
  const MAX_FILE_BYTES=5*1024*1024;
  const MAX_INPUT_SNAPSHOTS=1000;
  const MAX_STORED_SNAPSHOTS=12;

  function text(value,max){return typeof value==="string"?value.slice(0,max):""}
  function number(value,min,max){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):0}
  function normalizeSnapshot(value){
    if(!value||typeof value!=="object"||Array.isArray(value))return null;
    const bands=Array.isArray(value.bands)?value.bands.slice(0,5).map(v=>Math.round(number(v,0,255))):[];
    return{
      time:text(value.time,120),
      profile:text(value.profile,120),
      score:Math.round(number(value.score,0,100)),
      focus:text(value.focus,80),
      bands
    };
  }
  function key(snapshot){return JSON.stringify([snapshot.time,snapshot.profile,snapshot.score,snapshot.focus,snapshot.bands])}
  function normalizeList(values){
    if(!Array.isArray(values))throw new Error("Backup snapshots must be an array.");
    if(values.length>MAX_INPUT_SNAPSHOTS)throw new Error("Backup contains too many snapshots.");
    return values.map(normalizeSnapshot).filter(Boolean);
  }
  function parseBackupObject(payload){
    if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new Error("Backup must be a JSON object.");
    if(payload.app!==APP)throw new Error("This backup belongs to a different app.");
    if(payload.schema!==undefined){
      if(payload.schema!==SCHEMA)throw new Error("Unsupported Acelynn Pro backup schema.");
      if(Number(payload.version)!==VERSION)throw new Error("Unsupported Acelynn Pro backup version.");
    }
    return normalizeList(payload.snapshots||[]);
  }
  function parseBackupText(raw){
    if(typeof raw!=="string")throw new Error("Backup must be text.");
    if(new TextEncoder().encode(raw).length>MAX_FILE_BYTES)throw new Error("Backup file is larger than 5 MB.");
    let payload;
    try{payload=JSON.parse(raw)}catch{throw new Error("Backup is not valid JSON.")}
    return parseBackupObject(payload);
  }
  function mergeSnapshots(currentValues,backupValues){
    const current=normalizeList(Array.isArray(currentValues)?currentValues:[]).slice(-MAX_STORED_SNAPSHOTS);
    const backup=normalizeList(Array.isArray(backupValues)?backupValues:[]);
    const seen=new Set(),merged=[];
    for(const item of current){const k=key(item);if(!seen.has(k)){seen.add(k);merged.push(item)}}
    const uniqueBackup=[];
    for(const item of backup){const k=key(item);if(!seen.has(k)){seen.add(k);uniqueBackup.push(item)}}
    const slots=Math.max(0,MAX_STORED_SNAPSHOTS-merged.length);
    if(slots)merged.push(...uniqueBackup.slice(-slots));
    return merged.slice(-MAX_STORED_SNAPSHOTS);
  }
  function createBackup(snapshots){
    return{app:APP,schema:SCHEMA,version:VERSION,created:new Date().toISOString(),snapshots:normalizeList(Array.isArray(snapshots)?snapshots:[]).slice(-MAX_STORED_SNAPSHOTS)};
  }
  function restore(storage,backupValues){
    if(!storage||typeof storage.getItem!=="function"||typeof storage.setItem!=="function")throw new Error("Storage is unavailable.");
    const previousRaw=storage.getItem(STORAGE_KEY);
    let current=[];
    if(previousRaw){try{current=JSON.parse(previousRaw)}catch{current=[]}}
    const merged=mergeSnapshots(current,backupValues);
    try{storage.setItem(STORAGE_KEY,JSON.stringify(merged))}
    catch(error){
      try{if(previousRaw===null&&typeof storage.removeItem==="function")storage.removeItem(STORAGE_KEY);else storage.setItem(STORAGE_KEY,previousRaw)}catch{}
      throw error;
    }
    return merged;
  }
  return{APP,SCHEMA,VERSION,STORAGE_KEY,MAX_FILE_BYTES,MAX_INPUT_SNAPSHOTS,MAX_STORED_SNAPSHOTS,normalizeSnapshot,parseBackupObject,parseBackupText,mergeSnapshots,createBackup,restore};
});
