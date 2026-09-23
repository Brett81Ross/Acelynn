import { STORES, requestToPromise } from './db.js';
import { read, runWriteTransaction } from './storage.js';
import { buildAnalysisRecord, buildVersionRecord } from './analysis-model.js';
import { compareAnalyses, comparisonSummary } from './comparability.js';

const USAGE_KEY = 'prePlayUsageCounters';

function now() { return Date.now(); }
function emptyUsage() {
  return { songsCreated: 0, versionsSavedBySong: {}, comparisonsBySong: {}, v1ToV2MsBySong: {}, analysesWithNote: 0, analysesSaved: 0, comparisonsWithSuppression: 0 };
}
async function usage() { return (await read.one(STORES.META, USAGE_KEY))?.value || emptyUsage(); }
async function writeUsage(value) {
  await runWriteTransaction([STORES.META], stores => requestToPromise(stores[STORES.META].put({ key: USAGE_KEY, value, updatedAt: now() })), { operation: 'localUsageCounters' });
}
export async function createSong({ projectId, title, profile = null }) {
  if (!projectId) throw new TypeError('projectId is required');
  const id = globalThis.crypto?.randomUUID?.() || `song-${now()}-${Math.random().toString(16).slice(2)}`;
  const t = now();
  const record = { id, projectId, name: String(title || 'Untitled song').slice(0,160), profile: profile || null, profileLocked: Boolean(profile), createdAt:t, updatedAt:t, metadata:{origin:'pre-play-core-loop'} };
  await runWriteTransaction([STORES.SONGS], s => requestToPromise(s[STORES.SONGS].put(record)), {operation:'createSong',songId:id});
  const u=await usage(); u.songsCreated=(u.songsCreated||0)+1; await writeUsage(u); return record;
}
export async function saveVersionAnalysis({ songId, label, versionNote='', analysis }) {
  const song=await read.one(STORES.SONGS,songId); if(!song) throw new Error('Song not found');
  const prior=(await read.byIndex(STORES.VERSIONS,'bySong',songId)).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const version=buildVersionRecord({songId,label:label||`v${prior.length+1}`,note:versionNote,parentVersionId:prior.at(-1)?.id||null});
  const record=buildAnalysisRecord({...analysis,songId,versionId:version.id});
  await runWriteTransaction([STORES.VERSIONS,STORES.ANALYSES,STORES.SONGS],async s=>{
    await requestToPromise(s[STORES.VERSIONS].put(version)); await requestToPromise(s[STORES.ANALYSES].put(record));
    await requestToPromise(s[STORES.SONGS].put({...song,updatedAt:now()}));
  },{operation:'saveVersionAnalysis',songId,versionId:version.id});
  const u=await usage(); u.analysesSaved=(u.analysesSaved||0)+1; if(record.userNote)u.analysesWithNote=(u.analysesWithNote||0)+1;
  u.versionsSavedBySong[songId]=(u.versionsSavedBySong[songId]||0)+1;
  if(prior.length===1&&!u.v1ToV2MsBySong[songId])u.v1ToV2MsBySong[songId]=Math.max(0,version.createdAt-prior[0].createdAt);
  await writeUsage(u); return {version,analysis:record};
}
export async function listSongHistory(songId) {
  const versions=(await read.byIndex(STORES.VERSIONS,'bySong',songId)).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const analyses=await read.byIndex(STORES.ANALYSES,'bySong',songId);
  const byVersion=new Map(analyses.map(a=>[a.versionId,a]));
  return versions.map(version=>({version,analysis:byVersion.get(version.id)||null}));
}
export async function compareVersions(songId,leftVersionId,rightVersionId) {
  const analyses=await read.byIndex(STORES.ANALYSES,'bySong',songId);
  const left=analyses.find(a=>a.versionId===leftVersionId),right=analyses.find(a=>a.versionId===rightVersionId);
  if(!left||!right)throw new Error('Both versions need an analysis before comparison');
  const diff=compareAnalyses(left,right),u=await usage();
  u.comparisonsBySong[songId]=(u.comparisonsBySong[songId]||0)+1;
  if(Object.values(diff.bands).some(b=>b.classification!=='comparable'))u.comparisonsWithSuppression=(u.comparisonsWithSuppression||0)+1;
  await writeUsage(u); return {diff,summary:comparisonSummary(diff),left,right};
}
export async function updateAnalysisNote(analysisId,note) {
  const record=await read.one(STORES.ANALYSES,analysisId); if(!record)throw new Error('Analysis not found');
  const next={...record,userNote:String(note||'').slice(0,1200)};
  await runWriteTransaction([STORES.ANALYSES],s=>requestToPromise(s[STORES.ANALYSES].put(next)),{operation:'updateAnalysisNote',analysisId}); return next;
}
export async function getLocalUsageCounters(){ return usage(); }
export const coreLoopApi=Object.freeze({createSong,saveVersionAnalysis,listSongHistory,compareVersions,updateAnalysisNote,getLocalUsageCounters});
globalThis.AcelynnCoreLoop=coreLoopApi;
