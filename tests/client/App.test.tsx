import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/client/App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App bootstrap', () => {
  it('renders confirmed health state from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: { status: 'ok' }, meta: { requestId: 'req_1' } })),
    );
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Tutor Matching Platform' })).toBeTruthy();
    expect(await screen.findByText('Máy chủ hoạt động bình thường.')).toBeTruthy();
  });

  it('renders an error state when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    render(<App />);
    expect(await screen.findByText('Không kết nối được máy chủ.')).toBeTruthy();
  });
});
