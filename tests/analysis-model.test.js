import { describe, expect, it } from 'vitest';
import { buildAnalysisRecord, buildVersionRecord, inferSourceFormat } from '../js/analysis-model.js';

describe('pre-Play song/version/analysis contract', () => {
  it('creates a version separately from its analysis', () => {
    const v=buildVersionRecord({songId:'song-1',label:'v2 – after vocal EQ',note:'Cut low mids'});
    expect(v).toMatchObject({songId:'song-1',label:'v2 – after vocal EQ',note:'Cut low mids'});
  });
  it('stores the conditions required for honest file comparison', () => {
    const a=buildAnalysisRecord({
      songId:'song-1',versionId:'version-1',captureMode:'file',
      sourceMetadata:{name:'mix.wav',type:'audio/wav',size:1234},
      sampleRate:48000,bitDepth:24,channelCount:2,profileUsed:'Balanced mix',
      bands:{sub:-30,bass:-25,mids:-20,presence:-24,air:-31},
      balance:{score:81,leadingRegion:'Mids'},levels:{peakDbfs:-4,rmsDbfs:-16},
      coachingText:'Check the mids.',userNote:'After EQ'
    });
    expect(a).toMatchObject({
      captureMode:'file',sourceFormat:'wav',sampleRate:48000,bitDepth:24,channelCount:2,
      profileUsed:'Balanced mix',analysisEngineVersion:'acelynn-core-1',
      levels:{peakDbfs:-4,rmsDbfs:-16,crestDb:12},coachingText:'Check the mids.',userNote:'After EQ'
    });
  });
  it('keeps microphone source format null', () => {
    const a=buildAnalysisRecord({songId:'s',versionId:'v',captureMode:'microphone',sourceMetadata:{name:'fake.wav'},bands:{}});
    expect(a.sourceFormat).toBeNull();
    expect(a.sourceMetadata.name).toBeNull();
  });
  it('infers common audio formats without pretending unknown metadata is known', () => {
    expect(inferSourceFormat({name:'mix.MP3'})).toBe('mp3');
    expect(inferSourceFormat({type:'audio/x-wav'})).toBe('wav');
    expect(inferSourceFormat({})).toBeNull();
  });
});
