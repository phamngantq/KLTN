import { z } from 'zod';

/** Contact phone belongs only to the account owner. Child/document data is out of scope. */
export const updateParentProfileSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(100).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{8,15}$/, 'Số điện thoại không hợp lệ.')
      .nullable()
      .optional(),
  })
  .refine((value) => value.displayName !== undefined || value.phone !== undefined, {
    message: 'Cần cung cấp ít nhất một trường để cập nhật.',
  });

export type UpdateParentProfileInput = z.infer<typeof updateParentProfileSchema>;

export interface ParentProfile {
  userId: string;
  email: string;
  displayName: string;
  phone: string | null;
}
