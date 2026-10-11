import { z } from 'zod';

/** Product roles available at sign-up. Moderator is provisioned by an operator only. */
export const SELF_SERVICE_ROLES = ['parent', 'tutor'] as const;

// Upper bound keeps hashing cost bounded (PBKDF2 input) and blocks payload abuse.
const password = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự.').max(128);
const email = z.email('Email không hợp lệ.').max(254);

export const registerSchema = z.strictObject({
  email,
  password,
  displayName: z.string().trim().min(1).max(100),
  role: z.enum(SELF_SERVICE_ROLES),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export type UserRole = 'student' | 'tutor' | 'admin';
export type ProductRole = 'parent' | 'tutor' | 'moderator';

/** Storage roles remain stable so existing user IDs, bookings and sessions retain their meaning. */
export function productRoleFor(role: UserRole): ProductRole {
  switch (role) {
    case 'student':
      return 'parent';
    case 'tutor':
      return 'tutor';
    case 'admin':
      return 'moderator';
  }
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  /** Derived from the server-trusted storage role. New product UI should use this label. */
  productRole: ProductRole;
}

/** Returned by register/login/me. The client echoes csrfToken in `X-CSRF-Token` on unsafe requests. */
export interface SessionPayload {
  user: PublicUser;
  csrfToken: string;
}
