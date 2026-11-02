// Plan morning-digest § 1. The contract every part of § 2 builds against: one row per job for a
// night read from runs/<night>.jsonl.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One parsed line of a run log.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the log's offset (styleguide); `owner` stays null and the view
// shows it as `—`.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number; // lines for this job that parsed
  retries: number; // of those, status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // `error` of the job's last line, if any
  first: string;
  last: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that didn't parse: counted, never thrown
  counts: Record<RunStatus, number>; // parsed lines by status, for the board (§ 2c)
};

// null when runs/<night>.jsonl doesn't exist (the routes answer 404). An empty file is a Night
// with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
