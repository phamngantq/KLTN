import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { Page, PublicTutor } from '../../src/shared/schemas/discovery';
import {
  api,
  createPublicTutor,
  errorCode,
  jsonInit,
  register,
  type PublicTutorFixture,
} from './helpers';

async function search(query: string) {
  const res = await api(`/tutors${query}`);
  expect(res.status).toBe(200);
  return (await res.json<ApiSuccess<Page<PublicTutor>>>()).data;
}

// Each test file has its own isolated D1, so the fixture set below is the whole public catalogue.
let cheapMathOnline: PublicTutorFixture;
let pricyEnglishOffline: PublicTutorFixture;
let midBoth: PublicTutorFixture;
let hiddenIds: string[] = [];

beforeAll(async () => {
  cheapMathOnline = await createPublicTutor({
    hourlyRateMinor: 150_000,
    subjectIds: ['subj_math'],
  });
  pricyEnglishOffline = await createPublicTutor({
    hourlyRateMinor: 400_000,
    subjectIds: ['subj_english'],
    teachesOnline: false,
    teachesOffline: true,
  });
  midBoth = await createPublicTutor({
    hourlyRateMinor: 250_000,
    subjectIds: ['subj_math', 'subj_english'],
    teachesOnline: true,
    teachesOffline: true,
  });

  // Non-public tutors that must never leak: draft, pending, rejected, approved-but-hidden, suspended.
  const draft = await register('tutor');
  await api(
    '/tutor/profile',
    jsonInit(
      'PATCH',
      { bio: 'draft', hourlyRateMinor: 100_000, subjectIds: ['subj_math'], teachesOnline: true },
      draft,
    ),
  );
  const pending = await createPublicTutor();
  await env.DB.prepare(
    "UPDATE tutor_profiles SET approval_status = 'pending', visibility = 'private' WHERE user_id = ?",
  )
    .bind(pending.userId)
    .run();
  const hidden = await createPublicTutor();
  await env.DB.prepare("UPDATE tutor_profiles SET visibility = 'private' WHERE user_id = ?")
    .bind(hidden.userId)
    .run();
  const suspended = await createPublicTutor();
  await env.DB.prepare("UPDATE users SET status = 'suspended' WHERE id = ?")
    .bind(suspended.userId)
    .run();
  hiddenIds = [draft.userId, pending.userId, hidden.userId, suspended.userId];
});

describe('GET /tutors', () => {
  it('lists only approved, public, active tutors with public fields only', async () => {
    const page = await search('');
    expect(page.total).toBe(3);
    expect(page.items.map((t) => t.id).sort()).toEqual(
      [cheapMathOnline.userId, pricyEnglishOffline.userId, midBoth.userId].sort(),
    );
    for (const id of hiddenIds) expect(page.items.map((t) => t.id)).not.toContain(id);
    const json = JSON.stringify(page);
    expect(json).not.toMatch(/email|approval|visibility|status|password/i);
  });

  it('sorts deterministically (default rate ascending)', async () => {
    expect((await search('')).items.map((t) => t.hourlyRateMinor)).toEqual([
      150_000, 250_000, 400_000,
    ]);
    expect((await search('?sort=rate_desc')).items.map((t) => t.hourlyRateMinor)).toEqual([
      400_000, 250_000, 150_000,
    ]);
  });

  it('filters by subject, mode and price range', async () => {
    expect((await search('?subject=toan')).items.map((t) => t.id)).toEqual([
      cheapMathOnline.userId,
      midBoth.userId,
    ]);
    expect((await search('?mode=offline')).items.map((t) => t.id)).toEqual([
      midBoth.userId,
      pricyEnglishOffline.userId,
    ]);
    expect((await search('?minRate=200000&maxRate=300000')).items.map((t) => t.id)).toEqual([
      midBoth.userId,
    ]);
    expect((await search('?subject=tieng-anh&mode=online')).items.map((t) => t.id)).toEqual([
      midBoth.userId,
    ]);
    expect((await search('?subject=lich-su')).items).toEqual([]);
  });

  it('paginates with total count', async () => {
    const first = await search('?pageSize=2&page=1');
    const second = await search('?pageSize=2&page=2');
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((t) => t.id)).size).toBe(3);
  });

  it.each([
    ['?pageSize=49'],
    ['?page=0'],
    ['?mode=teleport'],
    ['?sort=random'],
    ['?minRate=-1'],
    ['?minRate=500000&maxRate=100000'],
    ["?subject=toan';DROP TABLE users;--"],
  ])('rejects %s with 422', async (query) => {
    const res = await api(`/tutors${query}`);
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('VALIDATION_ERROR');
  });

  it('ignores unknown query parameters', async () => {
    expect((await search('?utm_source=x')).total).toBe(3);
  });

  it('uses indexes for the public listing and subject filter', async () => {
    const { results } = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT p.user_id FROM tutor_profiles p JOIN users u ON u.id = p.user_id
       WHERE p.approval_status = 'approved' AND p.visibility = 'public' AND u.status = 'active'
         AND p.hourly_rate_minor IS NOT NULL
         AND EXISTS (SELECT 1 FROM tutor_subjects ts JOIN subjects s ON s.id = ts.subject_id
                     WHERE ts.tutor_id = p.user_id AND s.slug = 'toan')
       ORDER BY p.hourly_rate_minor`,
    ).all<{ detail: string }>();
    const plan = results.map((r) => r.detail).join('\n');
    expect(plan).toContain('tutor_profiles_public_rate_idx');
    expect(plan).not.toMatch(/SCAN p\b/);
  });
});

describe('GET /tutors/:slug', () => {
  it('returns a public tutor with subjects', async () => {
    const res = await api(`/tutors/${midBoth.slug}`);
    expect(res.status).toBe(200);
    const tutor = (await res.json<ApiSuccess<PublicTutor>>()).data;
    expect(tutor).toMatchObject({ id: midBoth.userId, slug: midBoth.slug, teachesOnline: true });
    expect(tutor.subjects.map((s) => s.slug).sort()).toEqual(['tieng-anh', 'toan']);
  });

  it('returns 404 for non-public tutors and unknown slugs (no detail leak)', async () => {
    const rows = await env.DB.prepare(
      `SELECT slug FROM tutor_profiles WHERE user_id IN (${hiddenIds.map(() => '?').join(',')})`,
    )
      .bind(...hiddenIds)
      .all<{ slug: string }>();
    expect(rows.results.length).toBe(4);
    for (const { slug } of rows.results) {
      const res = await api(`/tutors/${slug}`);
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe('TUTOR_NOT_FOUND');
    }
    expect((await api('/tutors/khong-ton-tai')).status).toBe(404);
  });
});
