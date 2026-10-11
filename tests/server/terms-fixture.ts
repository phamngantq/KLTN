import type { ApiSuccess } from '../../src/shared/api';
import type { AdminContent, PublishedContent } from '../../src/shared/schemas/content';
import type {
  AdminTermsQuiz,
  TutorQuizAttempt,
  TutorTermsQuiz,
} from '../../src/shared/schemas/terms-contracts';
import { api, jsonInit, type Session } from './helpers';

/** Synthetic test-only copy and answer; never seeded by migrations or shown as real policy. */
export async function publishTutorTermsQuiz(moderator: Session): Promise<AdminTermsQuiz> {
  let publishedResponse = await api('/content/terms/tutor-responsibility?audience=tutor', {
    headers: { Cookie: moderator.cookie },
  });
  if (publishedResponse.status === 404) {
    const draftResponse = await api(
      '/admin/content',
      jsonInit(
        'POST',
        {
          kind: 'terms',
          slug: 'tutor-responsibility',
          audience: 'tutor',
          title: 'Synthetic tutor terms',
          summary: '',
          bodyText: 'Synthetic policy content for integration tests.',
        },
        moderator,
      ),
    );
    if (draftResponse.status !== 201)
      throw new Error(`terms draft ${draftResponse.status}: ${await draftResponse.text()}`);
    const draft = (await draftResponse.json<ApiSuccess<AdminContent>>()).data;
    const publish = await api(
      `/admin/content/${draft.id}/publish`,
      jsonInit('POST', { editVersion: draft.editVersion }, moderator),
    );
    if (publish.status !== 200)
      throw new Error(`terms publish ${publish.status}: ${await publish.text()}`);
    publishedResponse = await api('/content/terms/tutor-responsibility?audience=tutor', {
      headers: { Cookie: moderator.cookie },
    });
  }
  if (publishedResponse.status !== 200)
    throw new Error(`terms current ${publishedResponse.status}: ${await publishedResponse.text()}`);
  const content = (await publishedResponse.json<ApiSuccess<PublishedContent>>()).data;
  const listResponse = await api('/admin/terms/quizzes', { headers: { Cookie: moderator.cookie } });
  if (listResponse.status !== 200)
    throw new Error(`quiz list ${listResponse.status}: ${await listResponse.text()}`);
  const existing = (await listResponse.json<ApiSuccess<AdminTermsQuiz[]>>()).data.find(
    (quiz) => quiz.termsContentRevisionId === content.id,
  );
  if (existing?.status === 'published') return existing;
  if (existing) {
    const publish = await api(
      `/admin/terms/quizzes/${existing.id}/publish`,
      jsonInit('POST', { editVersion: existing.editVersion }, moderator),
    );
    if (publish.status !== 200)
      throw new Error(`quiz publish ${publish.status}: ${await publish.text()}`);
    return (await publish.json<ApiSuccess<AdminTermsQuiz>>()).data;
  }
  const quizResponse = await api(
    '/admin/terms/quizzes',
    jsonInit(
      'POST',
      {
        termsContentRevisionId: content.id,
        questions: [
          {
            id: 'q1',
            prompt: 'Synthetic question for integration tests?',
            choices: [
              { id: 'yes', text: 'Yes' },
              { id: 'no', text: 'No' },
            ],
            correctChoiceId: 'yes',
          },
        ],
        minimumCorrect: 1,
      },
      moderator,
    ),
  );
  if (quizResponse.status !== 201)
    throw new Error(`quiz draft ${quizResponse.status}: ${await quizResponse.text()}`);
  const quiz = (await quizResponse.json<ApiSuccess<AdminTermsQuiz>>()).data;
  const publishedQuizResponse = await api(
    `/admin/terms/quizzes/${quiz.id}/publish`,
    jsonInit('POST', { editVersion: quiz.editVersion }, moderator),
  );
  if (publishedQuizResponse.status !== 200)
    throw new Error(
      `quiz publish ${publishedQuizResponse.status}: ${await publishedQuizResponse.text()}`,
    );
  return (await publishedQuizResponse.json<ApiSuccess<AdminTermsQuiz>>()).data;
}

export async function passAndAcknowledgeTutorTerms(tutor: Session): Promise<TutorQuizAttempt> {
  const response = await api('/tutor/terms/quiz', { headers: { Cookie: tutor.cookie } });
  if (response.status !== 200)
    throw new Error(`quiz view ${response.status}: ${await response.text()}`);
  const quiz = (await response.json<ApiSuccess<TutorTermsQuiz>>()).data;
  const attemptResponse = await api(
    '/tutor/terms/attempts',
    jsonInit(
      'POST',
      {
        quizId: quiz.quizId,
        answers: [{ questionId: 'q1', choiceId: 'yes' }],
      },
      tutor,
    ),
  );
  if (attemptResponse.status !== 201)
    throw new Error(`quiz attempt ${attemptResponse.status}: ${await attemptResponse.text()}`);
  const attempt = (await attemptResponse.json<ApiSuccess<TutorQuizAttempt>>()).data;
  if (!attempt.passed) throw new Error('Synthetic quiz did not pass.');
  const acknowledgement = await api(
    '/tutor/terms/acknowledgements',
    jsonInit(
      'POST',
      {
        quizId: quiz.quizId,
        attemptId: attempt.id,
        acknowledged: true,
      },
      tutor,
    ),
  );
  if (acknowledgement.status !== 201)
    throw new Error(
      `terms acknowledgement ${acknowledgement.status}: ${await acknowledgement.text()}`,
    );
  return attempt;
}

export async function publishTutorContract(moderator: Session): Promise<PublishedContent> {
  const path = '/content/contract/tutor-class-contract?audience=tutor';
  let current = await api(path, { headers: { Cookie: moderator.cookie } });
  if (current.status === 404) {
    const draftResponse = await api(
      '/admin/content',
      jsonInit(
        'POST',
        {
          kind: 'contract',
          slug: 'tutor-class-contract',
          audience: 'tutor',
          title: 'Synthetic class contract',
          summary: '',
          bodyText: 'Synthetic contract for integration tests.',
        },
        moderator,
      ),
    );
    if (draftResponse.status !== 201)
      throw new Error(`contract draft ${draftResponse.status}: ${await draftResponse.text()}`);
    const draft = (await draftResponse.json<ApiSuccess<AdminContent>>()).data;
    const publish = await api(
      `/admin/content/${draft.id}/publish`,
      jsonInit('POST', { editVersion: draft.editVersion }, moderator),
    );
    if (publish.status !== 200)
      throw new Error(`contract publish ${publish.status}: ${await publish.text()}`);
    current = await api(path, { headers: { Cookie: moderator.cookie } });
  }
  if (current.status !== 200)
    throw new Error(`contract current ${current.status}: ${await current.text()}`);
  return (await current.json<ApiSuccess<PublishedContent>>()).data;
}
