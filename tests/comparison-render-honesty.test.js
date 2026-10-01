import { describe,expect,it } from 'vitest';import fs from 'node:fs';
const index=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('js/ui-enhancements.js','utf8'),history=fs.readFileSync('js/song-history-ui.js','utf8'),cmp=fs.readFileSync('js/comparability.js','utf8');
describe('comparison render honesty',()=>{
 it('keeps the structured comparison path behind comparability classifications',()=>{expect(history).toMatch(/compareVersions/);expect(cmp).toMatch(/classification: 'comparable'/);expect(cmp).toMatch(/classification: 'direction-only'/);expect(cmp).toMatch(/classification: 'suppressed'/);});
 it('does not present the balance indicator as a quality verdict',()=>{for(const src of [index,ui,history])expect(src).not.toMatch(/Mix Health|Mix health/);});
 it('does not claim profile target matching in comparison coaching',()=>{expect(cmp).not.toMatch(/moved closer to|typical range for this profile/i);});
});
