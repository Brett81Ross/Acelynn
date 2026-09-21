import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const privacy = fs.readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');

describe('Google Play privacy surface', () => {
  it('keeps an in-app privacy policy link', () => {
    expect(index).toContain('href="/privacy.html"');
    expect(index).toContain('Privacy Policy');
  });

  it('discloses local microphone and audio-file processing', () => {
    expect(privacy).toContain('does not upload or transmit the microphone audio');
    expect(privacy).toContain('source audio file is not uploaded');
    expect(privacy).toContain('processes that file on your device');
  });

  it('documents the verified Play permission surface', () => {
    expect(privacy).toContain('microphone permission');
    expect(privacy).toContain('does not request camera');
    expect(privacy).toContain('location');
    expect(privacy).toContain('notification permission');
  });

  it('does not claim an account or analytics system that Acelynn does not use', () => {
    expect(privacy).toContain('does not use an Acelynn account');
    expect(privacy).toContain('advertising SDK');
    expect(privacy).toContain('analytics service');
  });
});
