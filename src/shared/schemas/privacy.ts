import { z } from 'zod';

export const deleteAccountSchema = z.strictObject({
  confirmation: z.literal('DELETE'),
});

export interface DeletedAccount {
  deletedAt: string;
}
