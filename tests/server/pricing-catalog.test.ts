import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type {
  ClassFeeGuidanceVersion,
  TuitionPriceVersion,
} from '../../src/shared/schemas/pricing';
import { api, errorCode, jsonInit, register, type Session } from './helpers';

async function moderator(): Promise<Session> {
  const account = await register('parent');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(account.userId).run();
  return account;
}

async function data<T>(response: Response): Promise<T> {
  return (await response.json<ApiSuccess<T>>()).data;
}

const tuitionInput = {
  subjectId: 'subj_math',
  gradeLabel: 'Lớp 6-7',
  level: 'basic',
  mode: 'online',
  pricePerSessionMinor: 150_000,
};

describe('D1 pricing catalogues', () => {
  it('requires a moderator for writes and publishes only released tuition revisions', async () => {
    const parent = await register('parent');
    expect((await api('/admin/pricing/tuition')).status).toBe(401);
    expect(
      (await api('/admin/pricing/tuition', jsonInit('POST', tuitionInput, parent))).status,
    ).toBe(403);
    const admin = await moderator();

    const createdResponse = await api(
      '/admin/pricing/tuition',
      jsonInit('POST', tuitionInput, admin),
    );
    expect(createdResponse.status).toBe(201);
    const draft = await data<TuitionPriceVersion>(createdResponse);
    expect(draft).toMatchObject({ version: 1, editVersion: 1, status: 'draft' });
    expect(await data<TuitionPriceVersion[]>(await api('/pricing/tuition'))).toEqual([]);

    const updatedResponse = await api(
      `/admin/pricing/tuition/${draft.id}`,
      jsonInit('PATCH', { editVersion: 1, pricePerSessionMinor: 155_000 }, admin),
    );
    expect(updatedResponse.status).toBe(200);
    const updated = await data<TuitionPriceVersion>(updatedResponse);
    expect(updated).toMatchObject({ editVersion: 2, pricePerSessionMinor: 155_000 });
    const stalePublish = await api(
      `/admin/pricing/tuition/${draft.id}/publish`,
      jsonInit('POST', { editVersion: 1 }, admin),
    );
    expect(stalePublish.status).toBe(409);
    expect(await errorCode(stalePublish)).toBe('PRICING_ITEM_STALE');

    const publishedResponse = await api(
      `/admin/pricing/tuition/${draft.id}/publish`,
      jsonInit('POST', { editVersion: 2 }, admin),
    );
    expect(publishedResponse.status).toBe(200);
    const published = await data<TuitionPriceVersion>(publishedResponse);
    expect(published).toMatchObject({
      status: 'published',
      version: 1,
      pricePerSessionMinor: 155_000,
    });
    expect((await data<TuitionPriceVersion[]>(await api('/pricing/tuition')))[0]).toMatchObject({
      id: draft.id,
      subjectName: 'Toán',
      pricePerSessionMinor: 155_000,
    });

    const revisionResponse = await api(
      '/admin/pricing/tuition',
      jsonInit(
        'POST',
        {
          ...tuitionInput,
          pricePerSessionMinor: 180_000,
        },
        admin,
      ),
    );
    expect(revisionResponse.status).toBe(201);
    const revision = await data<TuitionPriceVersion>(revisionResponse);
    expect(revision).toMatchObject({ status: 'draft', version: 2 });
    // The newer draft must not hide the previously published price.
    expect((await data<TuitionPriceVersion[]>(await api('/pricing/tuition')))[0]?.id).toBe(
      draft.id,
    );
    expect(
      (
        await data<TuitionPriceVersion[]>(
          await api('/admin/pricing/tuition', {
            headers: { Cookie: admin.cookie },
          }),
        )
      )[0]?.id,
    ).toBe(revision.id);
    expect(
      (
        await api(
          `/admin/pricing/tuition/${draft.id}/retire`,
          jsonInit('POST', { version: 1 }, admin),
        )
      ).status,
    ).toBe(409);

    const discard = await api(
      `/admin/pricing/tuition/${revision.id}/discard`,
      jsonInit('POST', { editVersion: 1 }, admin),
    );
    expect(discard.status).toBe(200);
    const retiredResponse = await api(
      `/admin/pricing/tuition/${draft.id}/retire`,
      jsonInit('POST', { version: 1 }, admin),
    );
    expect(retiredResponse.status).toBe(201);
    const retired = await data<TuitionPriceVersion>(retiredResponse);
    expect(retired).toMatchObject({ status: 'retired', version: 2 });
    expect(await data<TuitionPriceVersion[]>(await api('/pricing/tuition'))).toEqual([]);
    expect(
      (
        await api(
          `/admin/pricing/tuition/${draft.id}/retire`,
          jsonInit('POST', { version: 1 }, admin),
        )
      ).status,
    ).toBe(409);

    await expect(
      env.DB.prepare('UPDATE tuition_price_versions SET price_per_session_minor = 1 WHERE id = ?')
        .bind(draft.id)
        .run(),
    ).rejects.toThrow(/PUBLISHED_TUITION_PRICE_IMMUTABLE/);
    const audit = await env.DB.prepare(
      "SELECT count(*) AS n FROM audit_logs WHERE target_type = 'tuition_price_version'",
    ).first<{ n: number }>();
    expect(audit?.n).toBe(6);
  });

  it('stores class-fee ranges separately from tutor fee formulas and validates every write', async () => {
    const admin = await moderator();
    const invalid = await api(
      '/admin/pricing/class-fees',
      jsonInit(
        'POST',
        {
          mode: 'offline',
          minFeeMinor: 500_000,
          maxFeeMinor: 200_000,
          description: 'Phí nhận lớp trực tiếp theo hướng dẫn.',
        },
        admin,
      ),
    );
    expect(invalid.status).toBe(422);
    const createdResponse = await api(
      '/admin/pricing/class-fees',
      jsonInit(
        'POST',
        {
          mode: 'offline',
          minFeeMinor: 0,
          maxFeeMinor: 200_000,
          description: 'Phí tham khảo tùy khoảng cách và yêu cầu.',
        },
        admin,
      ),
    );
    expect(createdResponse.status).toBe(201);
    const draft = await data<ClassFeeGuidanceVersion>(createdResponse);
    expect(draft.status).toBe('draft');
    expect(await data<ClassFeeGuidanceVersion[]>(await api('/pricing/class-fees'))).toEqual([]);
    const patch = await api(
      `/admin/pricing/class-fees/${draft.id}`,
      jsonInit(
        'PATCH',
        {
          editVersion: 1,
          minFeeMinor: 0,
          maxFeeMinor: 250_000,
          description: 'Phí tham khảo tùy khoảng cách và yêu cầu mới.',
        },
        admin,
      ),
    );
    expect(patch.status).toBe(200);
    expect((await data<ClassFeeGuidanceVersion>(patch)).editVersion).toBe(2);
    const publish = await api(
      `/admin/pricing/class-fees/${draft.id}/publish`,
      jsonInit('POST', { editVersion: 2 }, admin),
    );
    expect(publish.status).toBe(200);
    expect(
      (await data<ClassFeeGuidanceVersion[]>(await api('/pricing/class-fees')))[0],
    ).toMatchObject({ mode: 'offline', minFeeMinor: 0, maxFeeMinor: 250_000 });
    const feeFormulaCount = await env.DB.prepare(
      'SELECT count(*) AS n FROM fee_option_versions',
    ).first<{ n: number }>();
    expect(feeFormulaCount?.n).toBe(0);
    await expect(
      env.DB.prepare('DELETE FROM class_fee_guidance_versions WHERE id = ?').bind(draft.id).run(),
    ).rejects.toThrow(/PUBLISHED_CLASS_FEE_GUIDANCE_IMMUTABLE/);
    const retire = await api(
      `/admin/pricing/class-fees/${draft.id}/retire`,
      jsonInit('POST', { version: 1 }, admin),
    );
    expect(retire.status).toBe(201);
    expect(await data<ClassFeeGuidanceVersion[]>(await api('/pricing/class-fees'))).toEqual([]);
  });

  it('shows one latest published tuition price after a revision and rejects double publish', async () => {
    const admin = await moderator();
    const input = {
      subjectId: 'subj_english',
      gradeLabel: 'IELTS/TOEIC',
      level: 'intensive',
      mode: 'online',
      pricePerSessionMinor: 350_000,
    };
    const first = await data<TuitionPriceVersion>(
      await api('/admin/pricing/tuition', jsonInit('POST', input, admin)),
    );
    expect(
      (
        await api(
          `/admin/pricing/tuition/${first.id}/publish`,
          jsonInit('POST', { editVersion: 1 }, admin),
        )
      ).status,
    ).toBe(200);
    const second = await data<TuitionPriceVersion>(
      await api(
        '/admin/pricing/tuition',
        jsonInit('POST', { ...input, pricePerSessionMinor: 375_000 }, admin),
      ),
    );
    const attempts = await Promise.all([
      api(
        `/admin/pricing/tuition/${second.id}/publish`,
        jsonInit('POST', { editVersion: 1 }, admin),
      ),
      api(
        `/admin/pricing/tuition/${second.id}/publish`,
        jsonInit('POST', { editVersion: 1 }, admin),
      ),
    ]);
    expect(attempts.map((response) => response.status).sort()).toEqual([200, 409]);
    const publicRows = await data<TuitionPriceVersion[]>(await api('/pricing/tuition'));
    expect(
      publicRows.filter(
        (row) =>
          row.subjectId === input.subjectId &&
          row.gradeLabel === input.gradeLabel &&
          row.level === input.level &&
          row.mode === input.mode,
      ),
    ).toMatchObject([{ id: second.id, version: 2, pricePerSessionMinor: 375_000 }]);
  });

  it('rejects unknown subjects, duplicate drafts and simultaneous creates', async () => {
    const admin = await moderator();
    const concurrentInput = { ...tuitionInput, gradeLabel: 'Lớp 8-9' };
    const unknown = await api(
      '/admin/pricing/tuition',
      jsonInit(
        'POST',
        {
          ...tuitionInput,
          subjectId: 'missing-subject',
        },
        admin,
      ),
    );
    expect(unknown.status).toBe(422);
    const results = await Promise.all([
      api('/admin/pricing/tuition', jsonInit('POST', concurrentInput, admin)),
      api(
        '/admin/pricing/tuition',
        jsonInit('POST', { ...concurrentInput, pricePerSessionMinor: 160_000 }, admin),
      ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const duplicate = await api('/admin/pricing/tuition', jsonInit('POST', concurrentInput, admin));
    expect(duplicate.status).toBe(409);
    const rows = await env.DB.prepare(
      `SELECT count(*) AS n FROM tuition_price_versions WHERE subject_id = ?
      AND grade_label = ? AND level = ? AND mode = ?`,
    )
      .bind(
        concurrentInput.subjectId,
        concurrentInput.gradeLabel,
        concurrentInput.level,
        concurrentInput.mode,
      )
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });
});
