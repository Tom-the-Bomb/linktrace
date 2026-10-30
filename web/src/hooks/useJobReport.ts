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
const QUIET_FAILURES = 3;

// heavy refreshes ship every row, node and edge, so bigger crawls get them less often (5s to 30s)
const heavyEvery = (discovered: number) => Math.min(30, Math.max(5, Math.ceil(discovered / 200)));

export interface Tick {
  status: Status;
  heavy?: { rows: PageRow[]; report: Report; graph: GraphData };
}

// status first, so a complete crawl's heavy data is final
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

export function useJobReport(jobId: string, first?: Promise<Tick>) {
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<PageRow[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // setTimeout, not setInterval, so requests can't overlap
  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    let tick = 0;
    let lastHeavy = 0;
    let discovered = 0;
    let failures = 0;
    // used once, so retries don't re-await a rejected promise
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
        // a poll that left before Stop landed mustn't flip the crawl back to running
        setStatus((prev) =>
          prev && isTerminalStatus(prev.status) && !isTerminalStatus(s.status) ? prev : s,
        );
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
