import { z } from 'zod';

const identifier = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/);
const choiceSchema = z.strictObject({ id: identifier, text: z.string().trim().min(1).max(250) });
const questionSchema = z.strictObject({
  id: identifier,
  prompt: z.string().trim().min(5).max(500),
  choices: z.array(choiceSchema).min(2).max(5),
  correctChoiceId: identifier,
});
export const quizQuestionsSchema = z
  .array(questionSchema)
  .min(1)
  .max(20)
  .superRefine((questions, ctx) => {
    const ids = new Set<string>();
    questions.forEach((question, index) => {
      if (ids.has(question.id))
        ctx.addIssue({ code: 'custom', message: 'Mã câu hỏi phải duy nhất.', path: [index, 'id'] });
      ids.add(question.id);
      const choiceIds = new Set(question.choices.map((choice) => choice.id));
      if (choiceIds.size !== question.choices.length)
        ctx.addIssue({
          code: 'custom',
          message: 'Mã lựa chọn phải duy nhất.',
          path: [index, 'choices'],
        });
      if (!choiceIds.has(question.correctChoiceId))
        ctx.addIssue({
          code: 'custom',
          message: 'Đáp án đúng không thuộc các lựa chọn.',
          path: [index, 'correctChoiceId'],
        });
    });
  });
export type QuizQuestion = z.infer<typeof questionSchema>;

const quizFields = {
  questions: quizQuestionsSchema,
  minimumCorrect: z.number().int().min(1).max(20),
};
export const createQuizSchema = z
  .strictObject({ termsContentRevisionId: z.uuid(), ...quizFields })
  .refine((value) => value.minimumCorrect <= value.questions.length, {
    path: ['minimumCorrect'],
    message: 'Điểm đạt vượt số câu hỏi.',
  });
export const editQuizSchema = z
  .strictObject({ editVersion: z.number().int().min(1), ...quizFields })
  .refine((value) => value.minimumCorrect <= value.questions.length, {
    path: ['minimumCorrect'],
    message: 'Điểm đạt vượt số câu hỏi.',
  });
export const publishQuizSchema = z.strictObject({ editVersion: z.number().int().min(1) });

export interface TutorQuizQuestion {
  id: string;
  prompt: string;
  choices: { id: string; text: string }[];
}
export interface AdminTermsQuiz {
  id: string;
  termsContentRevisionId: string;
  status: 'draft' | 'published';
  editVersion: number;
  questions: QuizQuestion[];
  minimumCorrect: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface TutorTermsQuiz {
  quizId: string;
  termsContentRevisionId: string;
  termsRevision: number;
  termsTitle: string;
  termsBodyText: string;
  questions: TutorQuizQuestion[];
  minimumCorrect: number;
  passed: boolean;
  passedAttemptId: string | null;
  acknowledgedAt: string | null;
}
export const submitQuizSchema = z.strictObject({
  quizId: z.uuid(),
  answers: z
    .array(z.strictObject({ questionId: identifier, choiceId: identifier }))
    .min(1)
    .max(20),
});
export interface TutorQuizAttempt {
  id: string;
  quizId: string;
  termsContentRevisionId: string;
  correctCount: number;
  questionCount: number;
  minimumCorrect: number;
  passed: boolean;
  createdAt: string;
}
export const acknowledgeTermsSchema = z.strictObject({
  quizId: z.uuid(),
  attemptId: z.uuid(),
  acknowledged: z.literal(true),
});
export interface TutorTermsAcknowledgement {
  quizId: string;
  termsContentRevisionId: string;
  acknowledgedAt: string;
}

export const issueContractSchema = z.strictObject({
  assignmentVersion: z.number().int().min(1),
  contentRevisionId: z.uuid(),
});
export const acknowledgeContractSchema = z.strictObject({
  version: z.number().int().min(1),
  acknowledged: z.literal(true),
});
export const contractListSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export const adminContractListSchema = z.strictObject({
  ...contractListSchema.shape,
  assignmentId: z.uuid().optional(),
});
export interface ClassContractRecord {
  id: string;
  assignmentId: string;
  classId: string;
  classCode: string;
  tutorUserId: string;
  status: 'issued' | 'acknowledged';
  version: number;
  contractContentRevisionId: string;
  contractRevision: number;
  contractTitle: string;
  contractBodyText: string;
  feeOptionVersionId: string;
  feeOptionKey: string;
  feeOptionTitle: string;
  feePolicyText: string;
  rateBasisPoints: number;
  depositBasisPoints: number | null;
  /** Snapshot in VND per lesson; null only for contracts issued before tuition capture. */
  agreedTuitionPerSessionMinor: number | null;
  issuedAt: string;
  acknowledgedAt: string | null;
}
export interface AdminContractCandidate {
  assignmentId: string;
  assignmentVersion: number;
  classId: string;
  classCode: string;
  tutorUserId: string;
  tutorDisplayName: string;
  assignedAt: string;
  contractId: string | null;
}
