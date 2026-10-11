import { z } from 'zod';
import type { ProductRole, UserRole } from './auth';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './discovery';

export const adminUserListSchema = z.strictObject({
  role: z.enum(['student', 'tutor', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type AdminUserListQuery = z.infer<typeof adminUserListSchema>;

export const changeUserStatusSchema = z.strictObject({
  updatedAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(1).max(500),
});

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  productRole: ProductRole;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}
