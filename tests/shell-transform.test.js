import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require=createRequire(import.meta.url);
const {VERSION,LOGO_SRC,SIGNAL_FLOOR_DBFS,isUsableSignal,transformShell}=require('../api/shell-transform.cjs');
const productionBase=readFileSync(new URL('../app-base.html',import.meta.url),'utf8');

function count(text,needle){return text.split(needle).length-1}

function assertHotfix(html){
  expect(html).toContain(`<img src="${LOGO_SRC}" alt="Acelynn Pro logo">`);
  expect(html).toContain('id="acelynnSplash"');
  expect(html).toContain('Acelynn Pro™</div><div class="acelynn-splash-meta">v1.2.0 · Cactus🌵Byte Studios™');
  expect(html).toContain('© 2026 Acelynn Pro™ · v1.2.0');
  expect(html).not.toContain('if(avg<8)');
  expect(html).toContain('signalDb<-72');
  expect(html).toContain('coach(result,vals,vals.reduce((a,b)=>a+b,0)/5,rmsDb);');
  expect(count(html,'class="mark acelynn-logo"')).toBe(1);
  expect(count(html,'id="acelynnSplash"')).toBe(1);
  expect(count(html,'splash.classList.add')).toBe(1);
}

describe('Acelynn v1.2 post-release shell hotfix',()=>{
  it('treats the screenshot RMS level as a usable signal while rejecting silence',()=>{
    expect(VERSION).toBe('1.2.0');
    expect(SIGNAL_FLOOR_DBFS).toBe(-72);
    expect(isUsableSignal(-46.5)).toBe(true);
    expect(isUsableSignal(-72)).toBe(true);
    expect(isUsableSignal(-80)).toBe(false);
    expect(isUsableSignal(Number.NaN)).toBe(false);
  });

  it('transforms the exact production base shell with the real logo splash version and RMS gate',()=>{
    const html=transformShell(productionBase);
    assertHotfix(html);
    expect(transformShell(html)).toBe(html);
  });

  it('fails closed if expected production anchors disappear',()=>{
    expect(()=>transformShell('<html><body>Acelynn Pro</body></html>')).toThrow(/header logo anchor/);
  });
});
