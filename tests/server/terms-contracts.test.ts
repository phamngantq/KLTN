import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiSuccess } from '../../src/shared/api';
import type { TutorQuizAttempt, TutorTermsQuiz } from '../../src/shared/schemas/terms-contracts';
import { api, jsonInit, register } from './helpers';
import { publishTutorTermsQuiz } from './terms-fixture';

describe('moderated tutor terms quiz', () => {
  it('hides answer keys, grades on the server, and requires a passed attempt plus explicit acknowledgement', async () => {
    const admin = await register('parent');
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(admin.userId).run();
    const tutor = await register('tutor');
    const parent = await register('parent');
    const quiz = await publishTutorTermsQuiz(admin);

    expect((await api('/tutor/terms/quiz')).status).toBe(401);
    expect((await api('/tutor/terms/quiz', { headers: { Cookie: parent.cookie } })).status).toBe(
      403,
    );
    const viewResponse = await api('/tutor/terms/quiz', { headers: { Cookie: tutor.cookie } });
    expect(viewResponse.status).toBe(200);
    const view = (await viewResponse.json<ApiSuccess<TutorTermsQuiz>>()).data;
    expect(view).toMatchObject({ quizId: quiz.id, passed: false, acknowledgedAt: null });
    expect(JSON.stringify(view)).not.toContain('correctChoiceId');
    // A choice ID is visible, but the answer key is not marked in the tutor projection.
    expect(view.questions[0]?.choices.map((item) => item.id)).toEqual(['yes', 'no']);

    const wrongResponse = await api(
      '/tutor/terms/attempts',
      jsonInit(
        'POST',
        {
          quizId: quiz.id,
          answers: [{ questionId: 'q1', choiceId: 'no' }],
        },
        tutor,
      ),
    );
    expect(wrongResponse.status).toBe(201);
    const wrong = (await wrongResponse.json<ApiSuccess<TutorQuizAttempt>>()).data;
    expect(wrong).toMatchObject({ correctCount: 0, passed: false });
    expect(
      (
        await api(
          '/tutor/terms/acknowledgements',
          jsonInit(
            'POST',
            {
              quizId: quiz.id,
              attemptId: wrong.id,
              acknowledged: true,
            },
            tutor,
          ),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await api(
          '/tutor/terms/attempts',
          jsonInit(
            'POST',
            {
              quizId: quiz.id,
              answers: [{ questionId: 'q1', choiceId: 'missing' }],
            },
            tutor,
          ),
        )
      ).status,
    ).toBe(422);
    await expect(
      env.DB.prepare(
        `INSERT INTO terms_quiz_attempts
      (id, tutor_user_id, quiz_id, answers_json, correct_count, passed, created_at)
      VALUES (?, ?, ?, ?, 1, 1, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          tutor.userId,
          quiz.id,
          JSON.stringify([{ questionId: 'q1', choiceId: 'no' }]),
          new Date().toISOString(),
        )
        .run(),
    ).rejects.toThrow(/TERMS_GRADE_INVALID/);

    const passResponse = await api(
      '/tutor/terms/attempts',
      jsonInit(
        'POST',
        {
          quizId: quiz.id,
          answers: [{ questionId: 'q1', choiceId: 'yes' }],
        },
        tutor,
      ),
    );
    expect(passResponse.status).toBe(201);
    const passed = (await passResponse.json<ApiSuccess<TutorQuizAttempt>>()).data;
    expect(passed).toMatchObject({ correctCount: 1, passed: true });
    const ackResponse = await api(
      '/tutor/terms/acknowledgements',
      jsonInit(
        'POST',
        {
          quizId: quiz.id,
          attemptId: passed.id,
          acknowledged: true,
        },
        tutor,
      ),
    );
    expect(ackResponse.status).toBe(201);
    const after = await api('/tutor/terms/quiz', { headers: { Cookie: tutor.cookie } });
    expect((await after.json<ApiSuccess<TutorTermsQuiz>>()).data).toMatchObject({
      passed: true,
      acknowledgedAt: expect.any(String),
    });
    const audit = await env.DB.prepare(
      "SELECT action FROM audit_logs WHERE actor_id = ? AND action LIKE 'terms%' ORDER BY created_at",
    )
      .bind(tutor.userId)
      .all<{ action: string }>();
    expect(audit.results.map((row) => row.action)).toContain('terms.acknowledged');
  });
});
