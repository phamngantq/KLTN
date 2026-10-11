import { env } from 'cloudflare:workers';
import { expect } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import {
  CONTACT_SHARING_CONSENT_VERSION,
  type OwnParentRequest,
} from '../../src/shared/schemas/requests';
import { api, type Session } from './helpers';

/** Recreates a pre-auto-publication submitted row for moderator legacy-path tests. */
export async function markLegacySubmittedRequest(
  parent: Session,
  draft: OwnParentRequest,
): Promise<OwnParentRequest> {
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  const [updated] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE parent_requests SET status = 'submitted', version = version + 1,
       mutation_id = ?, updated_at = ?
       WHERE id = ? AND parent_user_id = ? AND status = 'draft' AND version = ?`,
    ).bind(mutationId, now, draft.id, parent.userId, draft.version),
    env.DB.prepare(
      `UPDATE parent_request_private SET contact_consent_at = ?, contact_consent_version = ?
       WHERE request_id = ?`,
    ).bind(now, CONTACT_SHARING_CONSENT_VERSION, draft.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
       VALUES (?, ?, 'parent_request.submitted', 'parent_request', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      parent.userId,
      draft.id,
      JSON.stringify({ from: 'draft', to: 'submitted', version: draft.version + 1 }),
      now,
    ),
  ]);
  expect(updated?.meta.changes).toBe(1);
  const response = await api(`/parent/requests/${draft.id}`, {
    headers: { Cookie: parent.cookie },
  });
  expect(response.status).toBe(200);
  return (await response.json<ApiSuccess<OwnParentRequest>>()).data;
}
