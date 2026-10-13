import { PROFILE_PHOTO_MAX_BYTES } from '../../../shared/schemas/tutors';
import { AppError } from '../../lib/errors';

type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp';

const invalid = (message: string) =>
  new AppError(422, 'PROFILE_PHOTO_INVALID', message, [{ path: 'file', message }]);
const notFound = () => new AppError(404, 'PROFILE_PHOTO_NOT_FOUND', 'Chưa có ảnh đại diện.');

/** Image type from the file signature; the declared type is never trusted. */
function sniff(bytes: Uint8Array): PhotoType | null {
  const starts = (...sig: number[]) => sig.every((value, index) => bytes[index] === value);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP')
    return 'image/webp';
  return null;
}

export async function hasPhoto(db: D1Database, userId: string): Promise<boolean> {
  return !!(await db
    .prepare('SELECT 1 AS one FROM profile_photos WHERE user_id = ?')
    .bind(userId)
    .first());
}

export async function savePhoto(db: D1Database, userId: string, file: File): Promise<void> {
  if (file.size < 1) throw invalid('Ảnh trống.');
  if (file.size > PROFILE_PHOTO_MAX_BYTES) throw invalid('Ảnh đại diện tối đa 1 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) throw invalid('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO profile_photos (user_id, content_type, size_bytes, data, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET content_type = excluded.content_type,
           size_bytes = excluded.size_bytes, data = excluded.data, updated_at = excluded.updated_at`,
      )
      .bind(userId, type, bytes.byteLength, bytes, now),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         VALUES (?, ?, 'profile.photo_updated', 'user', ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), userId, userId, JSON.stringify({ contentType: type }), now),
  ]);
}

export async function deletePhoto(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM profile_photos WHERE user_id = ?').bind(userId).run();
}

/** Inline image bytes; nosniff and a no-script CSP keep the browser on the stored type. */
export async function photoResponse(db: D1Database, userId: string): Promise<Response> {
  const row = await db
    .prepare(
      'SELECT content_type AS contentType, data, updated_at AS updatedAt FROM profile_photos WHERE user_id = ?',
    )
    .bind(userId)
    .first<{ contentType: PhotoType; data: ArrayBuffer | number[]; updatedAt: string }>();
  if (!row) throw notFound();
  const body = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data).buffer;
  return new Response(body, {
    headers: {
      'Content-Type': row.contentType,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}

/** Multipart "file" field with a request-size guard before parsing. */
export async function photoFromRequest(request: Request): Promise<File> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > PROFILE_PHOTO_MAX_BYTES + 64 * 1024) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Ảnh đại diện tối đa 1 MB.');
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw invalid('Cần chọn ảnh đại diện.');
  return file;
}
