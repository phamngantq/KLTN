import { and, asc, count, desc, eq, or, sql } from 'drizzle-orm';
import { productRoleFor } from '../../../shared/schemas/auth';
import type { AdminUser, AdminUserListQuery } from '../../../shared/schemas/admin-users';
import type { Page } from '../../../shared/schemas/discovery';
import type { Db } from '../../db/client';
import { accountDeletions, auditLogs, authSessions, users } from '../../db/schema';
import { AppError } from '../../lib/errors';

const columns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

function project(row: Omit<AdminUser, 'productRole'>): AdminUser {
  return { ...row, productRole: productRoleFor(row.role) };
}

export async function listAdminUsers(db: Db, query: AdminUserListQuery): Promise<Page<AdminUser>> {
  const term = query.search?.toLocaleLowerCase('vi-VN');
  const where = and(
    query.role ? eq(users.role, query.role) : undefined,
    query.status ? eq(users.status, query.status) : undefined,
    term
      ? or(
          sql`instr(lower(${users.displayName}), ${term}) > 0`,
          sql`instr(lower(${users.emailNormalized}), ${term}) > 0`,
        )
      : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select(columns)
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), asc(users.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all(),
    db.select({ total: count() }).from(users).where(where).all(),
  ]);
  return {
    items: rows.map(project),
    page: query.page,
    pageSize: query.pageSize,
    total: totals[0]?.total ?? 0,
  };
}

export async function getAdminUser(db: Db, id: string): Promise<AdminUser> {
  const row = await db.select(columns).from(users).where(eq(users.id, id)).get();
  if (!row) throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản.');
  return project(row);
}

/** Locks/unlocks parent or tutor accounts with CAS, session revocation and audit. */
export async function changeUserStatus(
  db: Db,
  moderatorId: string,
  id: string,
  expectedUpdatedAt: string,
  reason: string,
  target: 'active' | 'suspended',
  now = new Date(),
): Promise<AdminUser> {
  const current = await getAdminUser(db, id);
  if (current.role === 'admin' || id === moderatorId) {
    throw new AppError(
      403,
      'MODERATOR_PROTECTED',
      'Không thể thay đổi trạng thái kiểm duyệt viên.',
    );
  }
  const deleted = await db
    .select({ userId: accountDeletions.userId })
    .from(accountDeletions)
    .where(eq(accountDeletions.userId, id))
    .get();
  if (deleted) {
    throw new AppError(409, 'ACCOUNT_DELETED', 'Tài khoản đã được xóa và không thể kích hoạt lại.');
  }
  if (current.updatedAt !== expectedUpdatedAt || current.status === target) {
    throw new AppError(409, 'STALE_USER', 'Tài khoản đã thay đổi. Vui lòng tải lại.');
  }
  const changedAt = new Date(
    Math.max(now.getTime(), Date.parse(current.updatedAt) + 1),
  ).toISOString();
  const update = db
    .update(users)
    .set({ status: target, updatedAt: changedAt })
    .where(
      and(
        eq(users.id, id),
        eq(users.updatedAt, expectedUpdatedAt),
        eq(users.status, current.status),
      ),
    )
    .returning({ id: users.id });
  const metadata = JSON.stringify({ from: current.status, to: target, reason });
  const audit = db.insert(auditLogs).select(sql`SELECT ${crypto.randomUUID()}, ${moderatorId},
      'user.status_changed', 'user', ${id}, ${metadata}, ${changedAt}
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ${id} AND status = ${target} AND updated_at = ${changedAt})`);
  if (target === 'suspended') {
    const sessions = db
      .update(authSessions)
      .set({ revokedAt: changedAt })
      .where(
        and(
          eq(authSessions.userId, id),
          sql`${authSessions.revokedAt} IS NULL`,
          sql`EXISTS (SELECT 1 FROM users WHERE id = ${id} AND status = 'suspended' AND updated_at = ${changedAt})`,
        ),
      );
    const [updated] = await db.batch([update, sessions, audit]);
    if (updated.length !== 1)
      throw new AppError(409, 'STALE_USER', 'Tài khoản đã thay đổi. Vui lòng tải lại.');
  } else {
    const [updated] = await db.batch([update, audit]);
    if (updated.length !== 1)
      throw new AppError(409, 'STALE_USER', 'Tài khoản đã thay đổi. Vui lòng tải lại.');
  }
  return getAdminUser(db, id);
}
