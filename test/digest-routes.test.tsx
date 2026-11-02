import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const GOOD = '2026-01-10';
const EMPTY = '2026-01-11';
const BAD = '2026-01-12';
const MISSING = '2026-01-13';

const line = (at: string, job: string, status: string, owner: string, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

let tmp: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-digest-'));
  const good = [
    line('2026-01-10T23:00:02+01:00', 'rig/rotate-logs', 'ok', 'lane-07'),
    line('2026-01-10T23:00:06+01:00', 'lane/sync', 'retry', 'rook', 'timeout'),
    line('2026-01-11T00:00:04+01:00', 'lane/sync', 'retry', 'rook', 'timeout'),
    line('2026-01-11T01:00:04+01:00', 'lane/sync', 'retry', 'rook', 'timeout'),
    line('2026-01-11T02:00:04+01:00', 'lane/sync', 'fail', 'rook', 'gave up'),
    line('2026-01-11T03:00:00+01:00', 'backup/db', 'ok', 'lane-07'),
  ];
  fs.writeFileSync(path.join(tmp, `${GOOD}.jsonl`), good.join('\n') + '\n');
  fs.writeFileSync(path.join(tmp, `${EMPTY}.jsonl`), '');
  const bad = [
    line('2026-01-12T23:00:02+01:00', 'rig/rotate-logs', 'ok', 'lane-07'),
    line('2026-01-12T23:10:00+01:00', 'lane/sync', 'ok', 'rook'),
    '{"at":"2026-01-12T23:20:00+01:00","job":"backup/d',
  ];
  fs.writeFileSync(path.join(tmp, `${BAD}.jsonl`), bad.join('\n') + '\n');
  app = createApp({ ...config, runsDir: tmp });
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

type JsonNight = { night: string; rows: { job: string }[]; badLines: number };

describe('GET /digest/:night', () => {
  it('200 for a night with a file, listing its jobs', async () => {
    const res = await app.request(`/digest/${GOOD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['rig/rotate-logs', 'lane/sync', 'backup/db']) expect(html).toContain(job);
  });

  it('404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('notes the bad line and still lists the jobs', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toMatch(/1 lines? didn(')?(&#39;)?t parse/);
    expect(html).toContain('rig/rotate-logs');
    expect(html).toContain('lane/sync');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with the Night object for a good night', async () => {
    const res = await app.request(`/api/digest/${GOOD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonNight;
    expect(body.night).toBe(GOOD);
    expect(body.rows.map((r) => r.job)).toEqual(['backup/db', 'lane/sync', 'rig/rotate-logs']);
    expect(body.badLines).toBe(0);
  });

  it('404 JSON for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toBeTypeOf('object');
  });

  it('empty night has rows []', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonNight;
    expect(body.rows).toEqual([]);
  });

  it('bad-line night is 200 with badLines 1', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonNight;
    expect(body.badLines).toBe(1);
    expect(body.rows.length).toBe(2);
  });
});

describe('page and JSON agree', () => {
  it('lists jobs in the same order in the HTML as in the JSON', async () => {
    const body = (await (await app.request(`/api/digest/${GOOD}`)).json()) as JsonNight;
    const html = await (await app.request(`/digest/${GOOD}`)).text();
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
