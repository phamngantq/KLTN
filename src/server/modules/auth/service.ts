import type { LoginInput, PublicUser, RegisterInput } from '../../../shared/schemas/auth';
import type { Db } from '../../db/client';
import { randomToken, sha256Hex } from '../../lib/crypto';
import { AppError, isUniqueViolation } from '../../lib/errors';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password';
import * as repo from './repository';
import { SESSION_TTL_MS } from './session';

export interface IssuedSession {
  user: PublicUser;
  token: string;
  expiresAt: Date;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function newSession(userId: string, now: Date) {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const record: repo.NewSessionRecord = {
    id: crypto.randomUUID(),
    userId,
    tokenHash: await sha256Hex(token),
    expiresAt: expiresAt.toISOString(),
  };
  return { token, expiresAt, record };
}

export async function register(
  db: Db,
  input: RegisterInput,
  now = new Date(),
): Promise<IssuedSession> {
  const user: repo.NewUserRecord = {
    id: crypto.randomUUID(),
    email: input.email.trim(),
    emailNormalized: normalizeEmail(input.email),
    displayName: input.displayName,
    role: input.role, // Zod restricts this to student|tutor; admin cannot be self-assigned.
    passwordHash: await hashPassword(input.password),
  };
  const session = await newSession(user.id, now);
  try {
    await repo.insertUserWithSession(db, user, session.record, now.toISOString());
  } catch (err) {
    if (isUniqueViolation(err, 'users.email_normalized')) {
      throw new AppError(409, 'EMAIL_TAKEN', 'Email này đã được đăng ký.');
    }
    throw err;
  }
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

const INVALID_CREDENTIALS = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');

export async function login(db: Db, input: LoginInput, now = new Date()): Promise<IssuedSession> {
  const candidate = await repo.findLoginCandidate(db, normalizeEmail(input.email));
  if (!candidate) {
    await burnPasswordCheck(input.password);
    throw INVALID_CREDENTIALS();
  }
  if (!(await verifyPassword(input.password, candidate.passwordHash))) throw INVALID_CREDENTIALS();
  if (candidate.status !== 'active') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Tài khoản đã bị khóa.');
  }
  const session = await newSession(candidate.id, now);
  await repo.insertSession(db, session.record, now.toISOString());
  const { id, email, displayName, role } = candidate;
  return {
    user: { id, email, displayName, role },
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

export async function resolveSession(db: Db, token: string, now = new Date()) {
  return repo.findActiveSession(db, await sha256Hex(token), now.toISOString());
}

export async function logout(db: Db, sessionId: string, now = new Date()): Promise<void> {
  await repo.revokeSession(db, sessionId, now.toISOString());
}
