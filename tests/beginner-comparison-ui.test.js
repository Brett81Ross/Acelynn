import {describe,expect,it} from 'vitest';import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('js/ui-enhancements.js','utf8'),history=fs.readFileSync('js/song-history-ui.js','utf8');
describe('beginner and comparison UX',()=>{
 it('offers tap explanations for all five bands',()=>{for(const b of ['sub','bass','mids','presence','air'])expect(html).toContain('data-band-help="'+b+'"');expect(ui).toMatch(/beginnerBandCopy/);});
 it('explicitly says Balance Score is not a quality grade',()=>{expect(html).toMatch(/not a grade of your song or mix quality/i);});
 it('renders all three trust states in the A\/B panel',()=>{expect(history).toMatch(/Comparable/);expect(history).toMatch(/Direction only/);expect(history).toMatch(/Suppressed/);expect(history).toMatch(/magnitude suppressed/);expect(history).toMatch(/Not reliable/);});
 it('keeps per-band reasons visible',()=>{expect(history).toMatch(/x\.reasons/);});
});
