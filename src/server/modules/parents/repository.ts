import { eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { UpdateParentProfileInput } from '../../../shared/schemas/parents';
import type { Db } from '../../db/client';
import { auditLogs, parentProfiles, users } from '../../db/schema';

export function findOwnProfile(db: Db, userId: string) {
  return db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      phone: parentProfiles.phone,
    })
    .from(users)
    .leftJoin(parentProfiles, eq(parentProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .get();
}

/** Only server-trusted userId enters this write; no caller-selected owner or role is accepted. */
export async function updateOwnProfile(
  db: Db,
  userId: string,
  input: UpdateParentProfileInput,
  now: string,
): Promise<void> {
  const writes: BatchItem<'sqlite'>[] = [];
  if (input.displayName !== undefined) {
    writes.push(
      db
        .update(users)
        .set({ displayName: input.displayName, updatedAt: now })
        .where(eq(users.id, userId)),
    );
  }
  if (input.phone !== undefined) {
    writes.push(
      db
        .insert(parentProfiles)
        .values({ userId, phone: input.phone, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: parentProfiles.userId,
          set: { phone: input.phone, updatedAt: now },
        }),
    );
  }
  writes.push(
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: userId,
      action: 'parent_profile.updated',
      targetType: 'parent_profile',
      targetId: userId,
      metadata: JSON.stringify({ fields: Object.keys(input).sort() }),
      createdAt: now,
    }),
  );
  const [first, ...rest] = writes;
  if (!first) throw new Error('Parent profile update requires a field');
  await db.batch([first, ...rest]);
}
