import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { authCredentials, authSessions, parentProfiles, users } from '../../db/schema';

const publicUserColumns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  role: users.role,
};

export interface NewUserRecord {
  id: string;
  email: string;
  emailNormalized: string;
  displayName: string;
  role: 'student' | 'tutor';
  passwordHash: string;
}

export interface NewSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
}

function sessionInsert(db: Db, session: NewSessionRecord, now: string) {
  return db.insert(authSessions).values({ ...session, createdAt: now });
}

/** User, credential and first session are written in one atomic D1 batch. */
export async function insertUserWithSession(
  db: Db,
  user: NewUserRecord,
  session: NewSessionRecord,
  now: string,
): Promise<void> {
  const { passwordHash, ...profile } = user;
  await db.batch([
    db.insert(users).values({ ...profile, status: 'active', createdAt: now, updatedAt: now }),
    ...(user.role === 'student'
      ? [db.insert(parentProfiles).values({ userId: user.id, createdAt: now, updatedAt: now })]
      : []),
    db.insert(authCredentials).values({ userId: user.id, passwordHash, updatedAt: now }),
    sessionInsert(db, session, now),
  ]);
}

export async function insertSession(db: Db, session: NewSessionRecord, now: string) {
  await sessionInsert(db, session, now);
}

export function findLoginCandidate(db: Db, emailNormalized: string) {
  return db
    .select({
      ...publicUserColumns,
      status: users.status,
      passwordHash: authCredentials.passwordHash,
    })
    .from(users)
    .innerJoin(authCredentials, eq(authCredentials.userId, users.id))
    .where(eq(users.emailNormalized, emailNormalized))
    .get();
}

/** Active (not revoked, not expired) session for an active user. */
export function findActiveSession(db: Db, tokenHash: string, now: string) {
  return db
    .select({ sessionId: authSessions.id, user: publicUserColumns })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
        eq(users.status, 'active'),
      ),
    )
    .get();
}

export async function revokeSession(db: Db, sessionId: string, now: string) {
  await db
    .update(authSessions)
    .set({ revokedAt: now })
    .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
}
