import {
  COMPLAINT_ATTACHMENT_MAX_BYTES,
  type ComplaintAttachment,
  type ComplaintAttachmentType,
} from '../../../shared/schemas/complaints';
import { AppError } from '../../lib/errors';

const invalid = (message: string) =>
  new AppError(422, 'COMPLAINT_ATTACHMENT_INVALID', message, [{ path: 'file', message }]);
const notFound = () => new AppError(404, 'COMPLAINT_ATTACHMENT_NOT_FOUND', 'Không tìm thấy tệp.');

/** Type from the file's own signature; the client-declared type is never trusted. */
function sniff(bytes: Uint8Array): ComplaintAttachmentType | null {
  const starts = (...sig: number[]) => sig.every((value, index) => bytes[index] === value);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp';
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  return null;
}

const EXTENSIONS: Record<ComplaintAttachmentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Keeps a readable name but drops paths, control characters and a misleading extension. */
function cleanName(raw: string, type: ComplaintAttachmentType): string {
  const printable = [...(raw.split(/[\\/]/).pop() ?? '')]
    .filter((char) => char.charCodeAt(0) > 0x1f && char.charCodeAt(0) !== 0x7f)
    .join('');
  const base =
    printable
      .replace(/["<>:|?*]/g, '')
      .replace(/\.[^.]*$/, '')
      .trim()
      .slice(0, 100) || 'minh-chung';
  return `${base}.${EXTENSIONS[type]}`;
}

const META_COLUMNS =
  'a.id, a.file_name AS fileName, a.content_type AS contentType, a.size_bytes AS sizeBytes, a.created_at AS createdAt';

export async function listAttachments(
  db: D1Database,
  complaintId: string,
): Promise<ComplaintAttachment[]> {
  const { results } = await db
    .prepare(
      `SELECT ${META_COLUMNS} FROM complaint_attachments a WHERE a.complaint_id = ? ORDER BY a.created_at, a.id`,
    )
    .bind(complaintId)
    .all<ComplaintAttachment>();
  return results;
}

async function ownDraft(db: D1Database, userId: string, complaintId: string) {
  const row = await db
    .prepare('SELECT status FROM complaints WHERE id = ? AND creator_user_id = ?')
    .bind(complaintId, userId)
    .first<{ status: string }>();
  if (!row) throw new AppError(404, 'COMPLAINT_NOT_FOUND', 'Không tìm thấy khiếu nại.');
  if (row.status !== 'draft') {
    throw new AppError(
      409,
      'STALE_COMPLAINT',
      'Chỉ thêm hoặc xóa minh chứng khi khiếu nại chưa gửi.',
    );
  }
}

export async function addAttachment(
  db: D1Database,
  userId: string,
  complaintId: string,
  file: File,
): Promise<ComplaintAttachment> {
  await ownDraft(db, userId, complaintId);
  if (file.size < 1) throw invalid('Tệp minh chứng trống.');
  if (file.size > COMPLAINT_ATTACHMENT_MAX_BYTES) throw invalid('Mỗi tệp tối đa 1,5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) throw invalid('Chỉ nhận ảnh JPG, PNG, WebP hoặc tệp PDF.');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO complaint_attachments (id, complaint_id, file_name, content_type, size_bytes, data, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, complaintId, cleanName(file.name, type), type, bytes.byteLength, bytes, now),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
           VALUES (?, ?, 'complaint.attachment_added', 'complaint', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          complaintId,
          JSON.stringify({ attachmentId: id, contentType: type, sizeBytes: bytes.byteLength }),
          now,
        ),
    ]);
  } catch (error) {
    if (String(error).includes('COMPLAINT_ATTACHMENT_INVALID')) {
      throw invalid('Mỗi khiếu nại có tối đa 3 tệp minh chứng và chỉ thêm khi chưa gửi.');
    }
    throw error;
  }
  const meta = (await listAttachments(db, complaintId)).find((item) => item.id === id);
  if (!meta) throw notFound();
  return meta;
}

export async function removeAttachment(
  db: D1Database,
  userId: string,
  complaintId: string,
  attachmentId: string,
): Promise<void> {
  await ownDraft(db, userId, complaintId);
  const [deleted] = await db.batch([
    db
      .prepare(
        `DELETE FROM complaint_attachments WHERE id = ? AND complaint_id = ?
         AND EXISTS (SELECT 1 FROM complaints WHERE id = ? AND status = 'draft')`,
      )
      .bind(attachmentId, complaintId, complaintId),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         SELECT ?, ?, 'complaint.attachment_removed', 'complaint', ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM complaint_attachments WHERE id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        complaintId,
        JSON.stringify({ attachmentId }),
        new Date().toISOString(),
        attachmentId,
      ),
  ]);
  if (!deleted?.meta.changes) throw notFound();
}

/**
 * File bytes for the author, or for a moderator once the complaint was sent.
 * Images open inline; PDFs always download. nosniff keeps browsers on the stored type.
 */
export async function downloadAttachment(
  db: D1Database,
  complaintId: string,
  attachmentId: string,
  viewer: { userId: string } | { moderator: true },
): Promise<Response> {
  const scope =
    'userId' in viewer ? 'c.creator_user_id = ?' : "c.status <> 'draft' AND ? IS NOT NULL";
  const row = await db
    .prepare(
      `SELECT a.file_name AS fileName, a.content_type AS contentType, a.data AS data
       FROM complaint_attachments a JOIN complaints c ON c.id = a.complaint_id
       WHERE a.id = ? AND a.complaint_id = ? AND ${scope}`,
    )
    .bind(attachmentId, complaintId, 'userId' in viewer ? viewer.userId : 'moderator')
    .first<{
      fileName: string;
      contentType: ComplaintAttachmentType;
      data: ArrayBuffer | number[];
    }>();
  if (!row) throw notFound();
  const body = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data).buffer;
  const disposition = row.contentType === 'application/pdf' ? 'attachment' : 'inline';
  return new Response(body, {
    headers: {
      'Content-Type': row.contentType,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox",
    },
  });
}
