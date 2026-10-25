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
import { errMessage } from '../lib/format';
import { isTerminalStatus } from '../lib/status';

const POLL_MS = 1000;
const HEAVY_EVERY_TICKS = 5; // ~5s between full results/report/graph refreshes
const MAX_POLL_FAILURES = 3; // consecutive errors before giving up on live updates

// polls a job until it finishes: status every tick, the heavy report data every few
export function useJobReport(jobId: string | undefined) {
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<PageRow[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // setTimeout recursion (not setInterval) so requests can't overlap
  useEffect(() => {
    if (!jobId) {
      return;
    }
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
    let failures = 0;

    const poll = async () => {
      try {
        const s = await getStatus(jobId);
        if (stop) {
          return;
        }
        setStatus(s);
        const done = isTerminalStatus(s.status);

        // results/report/graph are unbounded — a 10k-page crawl ships every row, node and edge.
        // Only /status is cheap enough for every tick; the rest refresh slowly, then once at the end.
        if (done || tick % HEAVY_EVERY_TICKS === 0) {
          const [r, rep, g] = await Promise.all([
            getResults(jobId),
            getReport(jobId),
            getGraph(jobId),
          ]);
          if (stop) {
            return;
          }
          setRows(r);
          setReport(rep);
          setGraph(g);
        }
        failures = 0;
        setError(null);
        if (done) {
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
        // one blip shouldn't end live updates for good; only surface a persistent failure
        if (++failures >= MAX_POLL_FAILURES) {
          setError(errMessage(err));
          return;
        }
      }
      tick++;
      if (!stop) {
        timer = window.setTimeout(poll, POLL_MS);
      }
    };

    void poll();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [jobId]);

  return { status, setStatus, rows, report, graph, error, setError, notFound };
}
