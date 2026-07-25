import { useEffect, useRef } from 'react';
import { listActiveJobs } from '../lib/api';
import { useToast } from '../state/toast';

/** Polls running SyncRun rows and surfaces job progress toasts. */
export function JobWatcher() {
  const { push } = useToast();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const { items } = await listActiveJobs();
        if (cancelled) return;
        for (const job of items) {
          const key = `${job.id}:${job.recordsSeen}`;
          if (seen.current.has(key)) continue;
          seen.current.add(key);
          const label = job.source.replace(/_/g, ' ');
          push(
            `${label}: ${job.recordsSeen.toLocaleString()} seen · ${job.recordsUpserted.toLocaleString()} upserted`,
            'info',
          );
        }
      } catch {
        /* ignore polling errors */
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [push]);

  return null;
}
