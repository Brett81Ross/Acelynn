const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const BASE='http://127.0.0.1:4173/';
const KEY='acelynn-snapshots';
const snap=(id,score=70)=>({time:id,profile:'Balanced mix',score,focus:'Mids',bands:[20,40,80,55,30]});

async function stored(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),KEY)}
async function seed(page,values){await page.evaluate(({key,values})=>localStorage.setItem(key,JSON.stringify(values)),{key:KEY,values});await page.reload({waitUntil:'domcontentloaded'})}
async function clear(page){await page.evaluate(key=>localStorage.removeItem(key),KEY);await page.reload({waitUntil:'domcontentloaded'})}
async function importBackup(page,payload,name='backup.json'){
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#restoreInput').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
  const download=await downloadPromise;
  await page.waitForFunction(()=>document.querySelector('#coachTitle')?.textContent==='Backup restored');
  return download;
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({acceptDownloads:true,viewport:{width:360,height:800}});
    const page=await context.newPage();
    await page.goto(BASE,{waitUntil:'domcontentloaded'});

    // Clean-install legacy restore: preserve the newest 12, oldest -> newest in storage.
    await clear(page);
    const legacyValues=Array.from({length:14},(_,i)=>snap(`legacy-${i}`,60+i));
    const preImport=await importBackup(page,{app:'Acelynn Pro',created:new Date().toISOString(),snapshots:legacyValues},'legacy-acelynn.json');
    assert.equal(preImport.suggestedFilename(),'acelynn-pro-pre-import-backup.json','pre-import safety backup filename');
    const prePath='/tmp/acelynn-pre-import-clean.json';
    await preImport.saveAs(prePath);
    const cleanSafety=JSON.parse(fs.readFileSync(prePath,'utf8'));
    assert.equal(cleanSafety.schema,'acelynn-pro-backup-v1','pre-import backup uses versioned schema');
    assert.deepEqual(cleanSafety.snapshots,[],'clean install pre-import backup records empty prior state');
    let values=await stored(page);
    assert.equal(values.length,12,'clean restore applies retention cap');
    assert.equal(values[0].time,'legacy-2','clean restore drops two oldest values');
    assert.equal(values[11].time,'legacy-13','clean restore keeps newest value at end');
    assert.equal(await page.locator('#sessionCount').textContent(),'12 saved','UI reflects clean restored count');

    // Simulate the next normal save operation after restore; newest recovered item must survive.
    values=[...values,snap('next-save',99)].slice(-12);
    await seed(page,values);
    values=await stored(page);
    assert.equal(values[0].time,'legacy-3','next save drops oldest recovered snapshot');
    assert.equal(values[10].time,'legacy-13','newest recovered snapshot survives next save');
    assert.equal(values[11].time,'next-save','new snapshot remains newest');

    // Merge onto an existing device, preserving current snapshots first and adding newest unique backup data.
    const current=[snap('current-0',90),snap('current-1',91)];
    await seed(page,current);
    const incoming=[snap('current-1',91),...Array.from({length:13},(_,i)=>snap(`incoming-${i}`,50+i))];
    const mergeDownload=await importBackup(page,{app:'Acelynn Pro',schema:'acelynn-pro-backup-v1',version:1,created:new Date().toISOString(),snapshots:incoming},'versioned-acelynn.json');
    const mergePath='/tmp/acelynn-pre-import-merge.json';
    await mergeDownload.saveAs(mergePath);
    const mergeSafety=JSON.parse(fs.readFileSync(mergePath,'utf8'));
    assert.deepEqual(mergeSafety.snapshots.map(x=>x.time),['current-0','current-1'],'pre-import backup preserves current device state before merge');
    values=await stored(page);
    assert.equal(values.length,12,'merge remains capped at 12');
    assert.deepEqual(values.slice(0,2).map(x=>x.time),['current-0','current-1'],'current device snapshots keep priority and order');
    assert.deepEqual(values.slice(2).map(x=>x.time),Array.from({length:10},(_,i)=>`incoming-${i+3}`),'merge adds newest unique backup values in chronological order');

    // Invalid backup must not replace current local state.
    const before=JSON.stringify(values);
    await page.locator('#restoreInput').setInputFiles({name:'wrong-app.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'Other',snapshots:[snap('bad')]}))});
    await page.waitForFunction(()=>document.querySelector('#coachTitle')?.textContent==='Backup could not be restored');
    assert.equal(JSON.stringify(await stored(page)),before,'rejected backup leaves local state unchanged');

    // Narrow-screen regression for the actual recovery controls.
    const box=await page.locator('#restoreButton').boundingBox();
    assert.ok(box&&box.width>250&&box.height>=40,'restore control remains usable on narrow phone viewport');
    assert.ok((await page.locator('#sessionCount').textContent()).includes('saved'),'session state remains visible after recovery');

    console.log('Acelynn Pro browser recovery round-trip QA passed.');
    await context.close();
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1)});
