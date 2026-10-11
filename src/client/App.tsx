import { useEffect, useState } from 'react';
import type { ApiSuccess, HealthStatus } from '../shared/api';

type HealthState = { kind: 'loading' } | { kind: 'ok' } | { kind: 'error' };

/**
 * Bootstrap shell only. Real screens are blocked on the Figma audit (TASK-05);
 * this page intentionally shows nothing beyond confirmed API state.
 */
export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/health', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ApiSuccess<HealthStatus>;
        setHealth(body.data.status === 'ok' ? { kind: 'ok' } : { kind: 'error' });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setHealth({ kind: 'error' });
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>Tutor Matching Platform</h1>
      <p role="status" aria-live="polite">
        {health.kind === 'loading' && 'Đang kiểm tra kết nối máy chủ…'}
        {health.kind === 'ok' && 'Máy chủ hoạt động bình thường.'}
        {health.kind === 'error' && 'Không kết nối được máy chủ.'}
      </p>
    </main>
  );
}
