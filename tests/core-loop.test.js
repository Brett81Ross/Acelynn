import { beforeEach, describe, expect, it } from 'vitest';
import { STORES, openDatabase, resetDatabaseConnectionForTests } from '../js/db.js';
import { clear, put, read } from '../js/storage.js';
import { createSong, getLocalUsageCounters, listSongHistory, saveVersionAnalysis, compareVersions, updateAnalysisNote } from '../js/core-loop.js';

beforeEach(async()=>{ resetDatabaseConnectionForTests(); await openDatabase(); for(const s of Object.values(STORES))await clear(s); localStorage.clear();
 await put(STORES.PROJECTS,{id:'p1',name:'Local',createdAt:1,updatedAt:1,metadata:{}});
});
const analysis=(name='mix.wav')=>({captureMode:'file',sourceMetadata:{name,type:'audio/wav'},sampleRate:48000,bitDepth:24,channelCount:2,profileUsed:'Balanced mix',bandUnit:'relative-db',bands:{sub:-30,bass:-25,mids:-20,presence:-24,air:-31},balance:{score:80,leadingRegion:'Mids'},levels:{peakDbfs:-4,rmsDbfs:-16},coachingText:'Check the mids.'});

describe('pre-Play core loop',()=>{
 it('persists Song → Version → Analysis history and editable notes',async()=>{
  const song=await createSong({projectId:'p1',title:'My Song',profile:'Balanced mix'});
  const one=await saveVersionAnalysis({songId:song.id,label:'v1',analysis:analysis()});
  const two=await saveVersionAnalysis({songId:song.id,label:'v2 – vocal EQ',versionNote:'EQ pass',analysis:{...analysis(),bands:{sub:-30,bass:-25,mids:-21,presence:-22,air:-31}}});
  await updateAnalysisNote(two.analysis.id,'Pulled 300 Hz down.');
  const history=await listSongHistory(song.id);
  expect(history).toHaveLength(2); expect(history[0].version.label).toBe('v1'); expect(history[1].analysis.userNote).toBe('Pulled 300 Hz down.');
  expect(history[1].version.parentVersionId).toBe(one.version.id);
 });
 it('runs guarded comparison and records only local counters',async()=>{
  const song=await createSong({projectId:'p1',title:'Compare Me'});
  const one=await saveVersionAnalysis({songId:song.id,label:'v1',analysis:analysis()});
  const two=await saveVersionAnalysis({songId:song.id,label:'v2',analysis:{...analysis(),bands:{sub:-29,bass:-25,mids:-20,presence:-22,air:-31}}});
  const result=await compareVersions(song.id,one.version.id,two.version.id);
  expect(result.diff.bands.presence).toMatchObject({classification:'comparable',delta:2});
  const counters=await getLocalUsageCounters(); expect(counters.songsCreated).toBe(1); expect(counters.comparisonsBySong[song.id]).toBe(1); expect(counters.versionsSavedBySong[song.id]).toBe(2);
 });
 it('keeps non-dB histories direction-only',async()=>{
  const song=await createSong({projectId:'p1',title:'Legacy Unit'});
  const a={...analysis(),bandUnit:'legacy-byte-energy',bands:{sub:20,bass:40,mids:80,presence:55,air:30}};
  const b={...a,bands:{sub:22,bass:40,mids:76,presence:60,air:30}};
  const one=await saveVersionAnalysis({songId:song.id,label:'v1',analysis:a}),two=await saveVersionAnalysis({songId:song.id,label:'v2',analysis:b});
  const result=await compareVersions(song.id,one.version.id,two.version.id);
  expect(result.diff.bands.sub.classification).toBe('direction-only'); expect(result.diff.bands.sub.delta).toBeNull();
 });
});
