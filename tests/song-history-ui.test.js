import { describe,expect,it } from 'vitest';import fs from 'node:fs';
const src=fs.readFileSync('js/song-history-ui.js','utf8'),boot=fs.readFileSync('js/static-shell-bootstrap.js','utf8');
describe('song history UI contract',()=>{
 it('shows version history and guarded latest-two comparison',()=>{expect(src).toMatch(/Song history/);expect(src).toMatch(/Compare latest two/);expect(src).toMatch(/compareVersions/);});
 it('supports editable per-analysis notes',()=>{expect(src).toMatch(/Add note to latest/);expect(src).toMatch(/updateAnalysisNote/);expect(src).toMatch(/Rename song/);expect(src).toMatch(/renameSong/);});
 it('escapes persisted names and notes before HTML rendering',()=>{expect(src).toMatch(/esc\(song\.name\)/);expect(src).toMatch(/esc\(v\.note\|\|a\?\.userNote/);});
 it('is loaded by the controlled static bootstrap',()=>{expect(boot).toMatch(/\/js\/song-history-ui\.js/);});
});
