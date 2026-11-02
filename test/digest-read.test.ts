import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl into one row per job', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    if (night === null) return;
    expect(night.rows).toHaveLength(5);
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    const byJob = Object.fromEntries(night.rows.map((r) => [r.job, r]));
    expect(byJob['digest/render']?.owner).toBeNull();
    expect(byJob['fixtures/refresh']).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      first: '2026-10-29T01:30:00+01:00',
      last: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob['notes/backup']).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  describe('temp runs dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('returns null for a night with no file', () => {
      expect(readNight(dir, '2026-01-01')).toBeNull();
    });

    it('reads an empty file as a night with no rows', () => {
      writeFileSync(join(dir, '2026-01-02.jsonl'), '');
      expect(readNight(dir, '2026-01-02')).toEqual({
        night: '2026-01-02',
        rows: [],
        badLines: 0,
        counts: { ok: 0, retry: 0, fail: 0 },
      });
    });

    it('counts lines that fail validation as bad, skips blank lines', () => {
      writeFileSync(
        join(dir, '2026-01-03.jsonl'),
        '{"at":"x","job":"a","status":"nope","owner":null}\n[1]\n{"at":"x","job":"a","status":"ok","owner":null}\n\n',
      );
      const night = readNight(dir, '2026-01-03');
      expect(night?.badLines).toBe(2);
      expect(night?.rows).toHaveLength(1);
    });

    it('rejects a night that is not YYYY-MM-DD', () => {
      expect(readNight(dir, '../etc/passwd')).toBeNull();
    });
  });
});
