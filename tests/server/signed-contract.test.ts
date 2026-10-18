import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { SignedContractScan } from '../../src/shared/schemas/tutors';
import { api, createPublicTutor, errorCode, register, type Session } from './helpers';

const PDF = new TextEncoder().encode('%PDF-1.4\n% scan of the signed contract\n%%EOF');

async function makeModerator(): Promise<Session> {
  const account = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(account.userId).run();
  return account;
}

function upload(session: Session, tutorId: string, fields: Record<string, string | Blob>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Blob) form.append(key, value, 'hop dong da ky.pdf');
    else form.append(key, value);
  }
  return api(`/admin/tutors/${tutorId}/signed-contract`, {
    method: 'POST',
    body: form,
    headers: { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken },
  });
}

const own = (tutor: Session) =>
  api('/tutor/profile/signed-contract', { headers: { Cookie: tutor.cookie } }).then(
    async (response) => (await response.json<ApiSuccess<SignedContractScan | null>>()).data,
  );

describe('signed contract scan', () => {
  it('lets a moderator upload the paper contract scan that only its tutor can read', async () => {
    const moderator = await makeModerator();
    const tutor = await createPublicTutor();
    const other = await createPublicTutor();
    expect(await own(tutor)).toBeNull();
    expect(
      (await api('/tutor/profile/signed-contract/file', { headers: { Cookie: tutor.cookie } }))
        .status,
    ).toBe(404);

    const file = new Blob([PDF], { type: 'application/pdf' });
    // Tutors cannot upload their own "signed" contract.
    expect((await upload(tutor, tutor.userId, { file, signedOn: '2026-10-15' })).status).toBe(403);
    const missingDate = await upload(moderator, tutor.userId, { file });
    expect(missingDate.status).toBe(422);
    const notPdf = await upload(moderator, tutor.userId, {
      file: new Blob([new TextEncoder().encode('plain text')]),
      signedOn: '2026-10-15',
    });
    expect(await errorCode(notPdf)).toBe('SIGNED_CONTRACT_INVALID');

    const saved = await upload(moderator, tutor.userId, {
      file,
      signedOn: '2026-10-15',
      contractNumber: '015/HĐNT-ĐH',
    });
    expect(saved.status).toBe(201);
    expect(await own(tutor)).toMatchObject({
      contractNumber: '015/HĐNT-ĐH',
      signedOn: '2026-10-15',
      fileName: 'hop dong da ky.pdf',
      contentType: 'application/pdf',
      sizeBytes: PDF.byteLength,
    });
    expect(await own(other)).toBeNull();

    const inline = await api('/tutor/profile/signed-contract/file', {
      headers: { Cookie: tutor.cookie },
    });
    expect(inline.headers.get('Content-Type')).toBe('application/pdf');
    expect(inline.headers.get('Content-Disposition')).toMatch(/^inline/);
    expect(new Uint8Array(await inline.arrayBuffer())).toEqual(PDF);
    const download = await api('/tutor/profile/signed-contract/file?download=1', {
      headers: { Cookie: tutor.cookie },
    });
    expect(download.headers.get('Content-Disposition')).toMatch(/^attachment/);

    // Re-upload replaces the single scan.
    await upload(moderator, tutor.userId, { file, signedOn: '2026-10-16' });
    expect(await own(tutor)).toMatchObject({ signedOn: '2026-10-16', contractNumber: null });
    const rows = await env.DB.prepare(
      'SELECT count(*) AS n FROM tutor_signed_contracts WHERE tutor_id = ?',
    )
      .bind(tutor.userId)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
    // D1 refuses an uploader who is not an active moderator.
    await expect(
      env.DB.prepare(
        `INSERT INTO tutor_signed_contracts (tutor_id, signed_on, file_name, content_type, size_bytes, data, uploaded_by, uploaded_at)
         VALUES (?, '2026-10-15', 'x.pdf', 'application/pdf', 1, X'00', ?, '2026-10-15T00:00:00.000Z')`,
      )
        .bind(other.userId, other.userId)
        .run(),
    ).rejects.toThrow(/SIGNED_CONTRACT_UPLOADER_INVALID/);
  });
});
