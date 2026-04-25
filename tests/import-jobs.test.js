import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const serverModulePaths = [
  '../server/import-jobs.js',
  '../server/import-service.js',
  '../server/album-helpers.js',
  '../server/spotify-helpers.js',
  '../server/db.js',
];

const tempDirs = [];
const openDbs = [];

function resetServerModules() {
  for (const modulePath of serverModulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function loadServerModules() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-import-test-'));
  tempDirs.push(dataDir);
  process.env.DATA_DIR = dataDir;
  resetServerModules();

  return {
    importJobs: require('../server/import-jobs.js'),
    dbModule: require('../server/db.js'),
  };
}

afterEach(() => {
  while (openDbs.length) {
    openDbs.pop()?.close();
  }
  delete process.env.DATA_DIR;
  resetServerModules();

  while (tempDirs.length) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('CSV import jobs', () => {
  it('parses CSV rows with quoted commas, quotes, CJK text, and defaulted status', () => {
    const { importJobs, dbModule } = loadServerModules();
    openDbs.push(dbModule.db);
    const csv = [
      'https://open.spotify.com/album/7MgKUMFAF55BX7vvfPeyFn?si=abc,40,"""Naive"", second line, 日本語",2024/10/28',
      'https://open.spotify.com/album/1234567890ABCDEFGHIJ,101,"notes",2024/99/40,Unknown',
      'not-a-spotify-link,50,,,Completed',
      'https://open.spotify.com/album/AAAAAAAAAAAAAAAAAAAA,,,2024/09/25,Planned',
      'https://open.spotify.com/album/BBBBBBBBBBBBBBBBBBBB,,,2024-09-26,Planned',
      'https://open.spotify.com/album/AAAAAAAAAAAAAAAAAAAA,,,,',
    ].join('\n');

    const rows = importJobs.parseCsvImportRows(csv, 'completed', new Set(['1234567890ABCDEFGHIJ']));

    expect(rows).toHaveLength(6);

    expect(rows[0]).toMatchObject({
      spotify_url: 'https://open.spotify.com/album/7MgKUMFAF55BX7vvfPeyFn',
      rating: 40,
      notes: '"Naive", second line, 日本語',
      listened_at: '2024-10-28',
      desired_status: 'completed',
      default_status_applied: 1,
      status: 'queued',
    });

    expect(rows[1].status).toBe('skipped');
    expect(rows[1].warnings).toEqual([
      'Rating "101" was invalid and was left blank.',
      'Date "2024/99/40" was invalid and was left blank.',
      'Status "Unknown" was invalid and fell back to completed. Valid values: Completed, Planned, Dropped.',
    ]);

    expect(rows[2]).toMatchObject({
      status: 'skipped',
      error: 'Row skipped because the Spotify URL field did not contain a valid Spotify album link.',
    });

    expect(rows[3]).toMatchObject({
      desired_status: 'planned',
      status: 'queued',
    });

    expect(rows[4]).toMatchObject({
      spotify_url: 'https://open.spotify.com/album/BBBBBBBBBBBBBBBBBBBB',
      listened_at: '2024-09-26',
      desired_status: 'planned',
      status: 'queued',
    });

    expect(rows[5]).toMatchObject({
      status: 'skipped',
      error: 'Duplicate album later in this CSV was skipped.',
      desired_status: 'completed',
    });
  });

  it('parses canonical header rows with reordered and missing optional columns', () => {
    const { importJobs, dbModule } = loadServerModules();
    openDbs.push(dbModule.db);
    const csv = [
      'Notes,Spotify URL,Status,Listen date',
      '"first note",https://open.spotify.com/album/ABCDEFGHIJKLMNOPQRST,Dropped,2024-01-20',
      '"second note",https://open.spotify.com/album/QRSTUVWXYZABCDEFGHI,,',
    ].join('\n');

    const rows = importJobs.parseCsvImportRows(csv, 'planned');

    expect(rows).toHaveLength(2);

    expect(rows[0]).toMatchObject({
      row_index: 2,
      spotify_url: 'https://open.spotify.com/album/ABCDEFGHIJKLMNOPQRST',
      rating: null,
      notes: 'first note',
      listened_at: '2024-01-20',
      desired_status: 'dropped',
      default_status_applied: 0,
      status: 'queued',
    });

    expect(rows[1]).toMatchObject({
      row_index: 3,
      spotify_url: 'https://open.spotify.com/album/QRSTUVWXYZABCDEFGHI',
      rating: null,
      notes: 'second note',
      listened_at: null,
      desired_status: 'planned',
      default_status_applied: 1,
      status: 'queued',
    });
  });

  it('reclaims expired row leases and completes the job after all rows finish', () => {
    const { importJobs, dbModule } = loadServerModules();
    const { db } = dbModule;
    openDbs.push(db);

    const csvBuffer = Buffer.from([
      'https://open.spotify.com/album/ABCDEFGHIJKLMNOPQRST,80,,2024/01/02,Completed',
      'https://open.spotify.com/album/QRSTUVWXYZABCDEFGHI,90,,,Planned',
    ].join('\n'), 'utf8');

    const createdJob = importJobs.createCsvImportJob({
      filename: 'albums.csv',
      defaultStatus: 'completed',
      csvBuffer,
    });

    expect(createdJob.status).toBe('queued');
    expect(createdJob.total_rows).toBe(2);

    const firstClaim = importJobs.claimNextImportRow('worker-1');
    expect(firstClaim.row.spotify_album_id).toBe('ABCDEFGHIJKLMNOPQRST');
    expect(firstClaim.job.status).toBe('processing');

    db.prepare(`
      UPDATE import_job_rows
      SET lease_expires_at = datetime('now', '-10 minutes')
      WHERE id = ?
    `).run(firstClaim.row.id);

    const reclaimed = importJobs.claimNextImportRow('worker-2');
    expect(reclaimed.row.id).toBe(firstClaim.row.id);
    expect(importJobs.getClaimedImportRow(reclaimed.row.id, 'worker-2').lease_owner).toBe('worker-2');

    let job = importJobs.markImportJobRowImported(reclaimed.row.id, 'worker-2', 91);
    expect(job.imported_rows).toBe(1);
    expect(job.remaining_rows).toBe(1);

    const secondClaim = importJobs.claimNextImportRow('worker-2');
    expect(secondClaim.row.spotify_album_id).toBe('QRSTUVWXYZABCDEFGHI');

    job = importJobs.markImportJobRowFailed(secondClaim.row.id, 'worker-2', 'GraphQL request failed.');
    expect(job.status).toBe('completed');
    expect(job.imported_rows).toBe(1);
    expect(job.failed_rows).toBe(1);
    expect(job.remaining_rows).toBe(0);
  });

  it('cancels queued and in-progress rows without rolling back imported rows', () => {
    const { importJobs, dbModule } = loadServerModules();
    const { db } = dbModule;
    openDbs.push(db);

    const csvBuffer = Buffer.from([
      'https://open.spotify.com/album/1111111111111111111111,80,,,Completed',
      'https://open.spotify.com/album/2222222222222222222222,90,,,Planned',
      'https://open.spotify.com/album/3333333333333333333333,70,,,Dropped',
    ].join('\n'), 'utf8');

    const createdJob = importJobs.createCsvImportJob({
      filename: 'cancel.csv',
      defaultStatus: 'completed',
      csvBuffer,
    });

    const claimed = importJobs.claimNextImportRow('worker-1');
    let job = importJobs.markImportJobRowImported(claimed.row.id, 'worker-1', 12);
    expect(job.imported_rows).toBe(1);

    const claimed2 = importJobs.claimNextImportRow('worker-1');
    expect(claimed2.row.spotify_album_id).toBe('2222222222222222222222');

    job = importJobs.cancelImportJob(createdJob.id);
    expect(job.status).toBe('canceled');
    expect(job.imported_rows).toBe(1);
    expect(job.canceled_rows).toBe(2);
    expect(job.remaining_rows).toBe(0);

    const rowStatuses = db.prepare(`
      SELECT row_index, status
      FROM import_job_rows
      WHERE job_id = ?
      ORDER BY row_index ASC
    `).all(createdJob.id);

    expect(rowStatuses).toEqual([
      { row_index: 1, status: 'imported' },
      { row_index: 2, status: 'canceled' },
      { row_index: 3, status: 'canceled' },
    ]);
  });
});
