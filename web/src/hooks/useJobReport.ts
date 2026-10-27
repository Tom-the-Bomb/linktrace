import { useEffect, useState } from 'react';

import {
  ApiError,
  type GraphData,
  type PageRow,
  type Report,
  type Status,
  getGraph,
  getReport,
  getResults,
  getStatus,
} from '../api';
import { isTerminalStatus } from '../lib/status';

const POLL_MS = 1000;
const MAX_BACKOFF_MS = 15_000;
const QUIET_FAILURES = 3; // consecutive errors before the banner, so one blip stays silent

// a heavy refresh ships every row, node and edge, so bigger crawls refresh less often: 5s up to 30s
const heavyEvery = (discovered: number) => Math.min(30, Math.max(5, Math.ceil(discovered / 200)));

export interface Tick {
  status: Status;
  heavy?: { rows: PageRow[]; report: Report; graph: GraphData };
}

// one poll: status, then the heavy data if due or finished. Status first, so a complete crawl's data is final
export async function fetchTick(jobId: string, heavy: boolean): Promise<Tick> {
  const status = await getStatus(jobId);
  if (!heavy && !isTerminalStatus(status.status)) {
    return { status };
  }
  const [rows, report, graph] = await Promise.all([
    getResults(jobId),
    getReport(jobId),
    getGraph(jobId),
  ]);
  return { status, heavy: { rows, report, graph } };
}

// polls a job until it finishes; `first` is the route loader's first poll
export function useJobReport(jobId: string, first?: Promise<Tick>) {
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<PageRow[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // setTimeout recursion (not setInterval) so requests can't overlap
  useEffect(() => {
    // reset when switching jobs
    setStatus(null);
    setRows([]);
    setReport(null);
    setGraph(null);
    setError(null);
    setNotFound(false);

    let stop = false;
    let timer: number | undefined;
    let tick = 0;
    let lastHeavy = 0;
    let discovered = 0;
    let failures = 0;
    // used once; retries fetch fresh rather than re-read a rejected promise
    let initial = first;

    const poll = async () => {
      try {
        const request =
          initial ?? fetchTick(jobId, tick === 0 || tick - lastHeavy >= heavyEvery(discovered));
        initial = undefined;
        const { status: s, heavy } = await request;
        if (stop) {
          return;
        }
        setStatus(s);
        discovered = s.discovered;
        if (heavy) {
          setRows(heavy.rows);
          setReport(heavy.report);
          setGraph(heavy.graph);
          lastHeavy = tick;
        }
        if (failures >= QUIET_FAILURES) {
          setError(null);
        }
        failures = 0;
        tick++;
        if (isTerminalStatus(s.status)) {
          return;
        }
      } catch (err) {
        if (stop) {
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        // never give up: back off and retry the same step, so the page recovers after an outage
        if (++failures >= QUIET_FAILURES) {
          setError("Can't reach LinkTrace right now. This page keeps retrying.");
        }
      }
      timer = window.setTimeout(
        poll,
        failures ? Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS) : POLL_MS,
      );
    };

    void poll();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [jobId, first]);

  return { status, setStatus, rows, report, graph, error, setError, notFound };
}
