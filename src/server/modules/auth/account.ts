import { productRoleFor, type PublicUser, type UserRole } from '../../../shared/schemas/auth';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from './password';

/** "Chỉnh sửa thông tin tài khoản": the display name every role may change for itself. */
export async function updateAccount(
  db: D1Database,
  userId: string,
  input: { displayName: string },
): Promise<PublicUser> {
  const now = new Date().toISOString();
  const [updated] = await db.batch([
    db
      .prepare(
        `UPDATE users SET display_name = ?, updated_at = ? WHERE id = ? AND status = 'active'`,
      )
      .bind(input.displayName, now, userId),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         VALUES (?, ?, 'account.updated', 'user', ?, '{"fields":["displayName"]}', ?)`,
      )
      .bind(crypto.randomUUID(), userId, userId, now),
  ]);
  if (updated?.meta.changes !== 1)
    throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
  const row = await db
    .prepare('SELECT id, email, display_name AS displayName, role FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; email: string; displayName: string; role: UserRole }>();
  if (!row) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
  return { ...row, productRole: productRoleFor(row.role) };
}

/**
 * Password change with the current password. Other sessions are signed out; the session that
 * made the change stays signed in.
 */
export async function changePassword(
  db: D1Database,
  userId: string,
  sessionId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const credential = await db
    .prepare('SELECT password_hash AS hash FROM auth_credentials WHERE user_id = ?')
    .bind(userId)
    .first<{ hash: string }>();
  if (!credential || !(await verifyPassword(input.currentPassword, credential.hash)))
    throw new AppError(422, 'CURRENT_PASSWORD_INVALID', 'Mật khẩu hiện tại không đúng.', [
      { path: 'currentPassword', message: 'Mật khẩu hiện tại không đúng.' },
    ]);
  if (input.currentPassword === input.newPassword)
    throw new AppError(422, 'PASSWORD_UNCHANGED', 'Mật khẩu mới phải khác mật khẩu hiện tại.', [
      { path: 'newPassword', message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' },
    ]);
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare('UPDATE auth_credentials SET password_hash = ?, updated_at = ? WHERE user_id = ?')
      .bind(await hashPassword(input.newPassword), now, userId),
    db
      .prepare(
        `UPDATE auth_sessions SET revoked_at = ?
         WHERE user_id = ? AND id <> ? AND revoked_at IS NULL`,
      )
      .bind(now, userId, sessionId),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         VALUES (?, ?, 'account.password_changed', 'user', ?, '{}', ?)`,
      )
      .bind(crypto.randomUUID(), userId, userId, now),
  ]);
}
