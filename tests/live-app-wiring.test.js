import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('live app bootstrap wiring', () => {
  it('boots the unified live app instead of the legacy inline live loop', () => {
    expect(existsSync('js/live-app.js')).toBe(true);
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('<script type="module" src="/js/live-app.js"></script>');
    expect(html).not.toContain('function loop(){if(!running)return;');
    expect(html).not.toContain("window.addEventListener('resize',draw)");
  });
});
