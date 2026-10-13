import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { LearnerStageCounts, OwnParentRequest } from '../../src/shared/schemas/requests';
import { api, createPublicTutor, errorCode, jsonInit, register, type Session } from './helpers';

const NOW = '2026-10-12T00:00:00.000Z';
const REQUEST = {
  subjectId: 'subj_math',
  grade: 'Lớp 9',
  mode: 'online',
  area: null,
  expectedBudgetMinor: 200_000,
  description: 'Ôn thi vào lớp 10.',
  schedule: { timezone: 'Asia/Ho_Chi_Minh', discussLater: true, windows: [] },
  contactPhone: '0912345678',
  studentName: 'Học sinh đề xuất',
  contactAddress: null,
} as const;

async function data<T>(response: Response): Promise<T> {
  return (await response.json<ApiSuccess<T>>()).data;
}

async function sentRequest(learner: Session): Promise<OwnParentRequest> {
  const created = await data<OwnParentRequest>(
    await api(
      '/parent/requests',
      jsonInit('POST', REQUEST, learner, { 'Idempotency-Key': crypto.randomUUID() }),
    ),
  );
  const submitted = await api(
    `/parent/requests/${created.id}/submit`,
    jsonInit('POST', { version: created.version, consentToShareContact: true }, learner),
  );
  expect(submitted.status).toBe(200);
  return data<OwnParentRequest>(submitted);
}

async function moderator(): Promise<Session> {
  const account = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(account.userId).run();
  return account;
}

function propose(requestId: string, tutorId: string, score: number, adminId: string) {
  const id = crypto.randomUUID();
  return env.DB.prepare(
    `INSERT INTO request_tutor_proposals (id, request_id, tutor_user_id, fit_score, proposed_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, requestId, tutorId, score, adminId, NOW)
    .run()
    .then(() => id);
}

const own = async (learner: Session, id: string) =>
  data<OwnParentRequest>(
    await api(`/parent/requests/${id}`, { headers: { Cookie: learner.cookie } }),
  );

const stages = async (learner: Session) =>
  data<LearnerStageCounts>(
    await api('/parent/requests/stage-counts', { headers: { Cookie: learner.cookie } }),
  );

describe('learner tutor proposals', () => {
  it('shows only proposals above 80 best first, and hiring one confirms the request', async () => {
    const learner = await register('parent');
    const other = await register('parent');
    const admin = await moderator();
    const [best, second, third, weak] = await Promise.all([
      createPublicTutor(),
      createPublicTutor(),
      createPublicTutor(),
      createPublicTutor(),
    ]);
    const request = await sentRequest(learner);
    expect(request.proposals).toEqual([]);
    expect(await stages(learner)).toMatchObject({ searching: 1, found: 0, confirmed: 0 });

    // Only a moderator can propose, only tutor accounts, only in the "proposed" state.
    await expect(propose(request.id, best.userId, 96, learner.userId)).rejects.toThrow(
      /PROPOSAL_INVALID/,
    );
    await expect(propose(request.id, other.userId, 96, admin.userId)).rejects.toThrow(
      /PROPOSAL_INVALID/,
    );
    const weakId = await propose(request.id, weak.userId, 80, admin.userId);
    const thirdId = await propose(request.id, third.userId, 85, admin.userId);
    const bestId = await propose(request.id, best.userId, 96, admin.userId);
    const secondId = await propose(request.id, second.userId, 91, admin.userId);

    const found = await own(learner, request.id);
    expect(found.stage).toBe('found');
    expect(found.proposals.map((item) => [item.id, item.fitScore, item.status])).toEqual([
      [bestId, 96, 'proposed'],
      [secondId, 91, 'proposed'],
      [thirdId, 85, 'proposed'],
    ]);
    expect(found.proposals[0]).toMatchObject({ subjects: ['Toán'], hasPhoto: false });
    expect(await stages(learner)).toMatchObject({ searching: 0, found: 1, confirmed: 0 });
    const groupList = await data<{ items: { id: string }[] }>(
      await api('/parent/requests?group=found', { headers: { Cookie: learner.cookie } }),
    );
    expect(groupList.items.map((item) => item.id)).toEqual([request.id]);

    const selectPath = (proposalId: string) =>
      `/parent/requests/${request.id}/proposals/${proposalId}/select`;
    // The 80-point proposal is hidden and cannot be chosen; strangers cannot choose at all.
    const hidden = await api(
      selectPath(weakId),
      jsonInit('POST', { version: found.version }, learner),
    );
    expect(hidden.status).toBe(404);
    expect(await errorCode(hidden)).toBe('PROPOSAL_NOT_FOUND');
    expect(
      (await api(selectPath(secondId), jsonInit('POST', { version: found.version }, other))).status,
    ).toBe(404);
    expect(
      (
        await api(`/parent/requests/${request.id}/proposals/${weakId}/photo`, {
          headers: { Cookie: learner.cookie },
        })
      ).status,
    ).toBe(404);
    const stale = await api(selectPath(secondId), jsonInit('POST', { version: 99 }, learner));
    expect(stale.status).toBe(409);
    expect((await own(learner, request.id)).stage).toBe('found');

    const hired = await api(
      selectPath(secondId),
      jsonInit('POST', { version: found.version }, learner),
    );
    expect(hired.status).toBe(200);
    const confirmed = await data<OwnParentRequest>(hired);
    expect(confirmed.stage).toBe('confirmed');
    expect(confirmed.version).toBe(found.version + 1);
    expect(confirmed.proposals.find((item) => item.id === secondId)).toMatchObject({
      status: 'selected',
      selectedAt: expect.any(String),
    });
    expect(
      confirmed.proposals.filter((item) => item.id !== secondId).map((item) => item.status),
    ).toEqual(['declined', 'declined']);
    expect(await stages(learner)).toMatchObject({ searching: 0, found: 0, confirmed: 1 });

    // A selection is final.
    const again = await api(
      selectPath(bestId),
      jsonInit('POST', { version: confirmed.version }, learner),
    );
    expect(again.status).toBe(409);
    await expect(
      env.DB.prepare(
        "UPDATE request_tutor_proposals SET status = 'proposed', selected_at = NULL WHERE id = ?",
      )
        .bind(secondId)
        .run(),
    ).rejects.toThrow(/PROPOSAL_TRANSITION_INVALID/);
    const audit = await env.DB.prepare(
      "SELECT count(*) AS n FROM audit_logs WHERE action = 'parent_request.proposal_selected' AND target_id = ?",
    )
      .bind(request.id)
      .first<{ n: number }>();
    expect(audit?.n).toBe(1);
  });

  it('keeps a request with only low-scoring proposals in "found" with an empty list', async () => {
    const learner = await register('parent');
    const admin = await moderator();
    const tutor = await createPublicTutor();
    const request = await sentRequest(learner);
    await propose(request.id, tutor.userId, 72, admin.userId);
    const current = await own(learner, request.id);
    expect(current.stage).toBe('found');
    expect(current.proposals).toEqual([]);
  });
});
