import {
  MAX_TUTOR_CREDENTIALS,
  TUTOR_DOCUMENT_KINDS,
  TUTOR_DOCUMENT_MAX_BYTES,
  type TutorDocument,
  type TutorDocumentKind,
  type TutorDocumentType,
} from '../../../shared/schemas/tutors';
import { AppError } from '../../lib/errors';

const invalid = (message: string) =>
  new AppError(422, 'TUTOR_DOCUMENT_INVALID', message, [{ path: 'file', message }]);
const notFound = () => new AppError(404, 'TUTOR_DOCUMENT_NOT_FOUND', 'Không tìm thấy tệp.');

/** Type from the file's own signature; the client-declared type is never trusted. */
export function sniff(bytes: Uint8Array): TutorDocumentType | null {
  const starts = (...sig: number[]) => sig.every((value, index) => bytes[index] === value);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP')
    return 'image/webp';
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  return null;
}

const EXTENSIONS: Record<TutorDocumentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Keeps a readable name but drops paths, control characters and a misleading extension. */
export function cleanName(raw: string, type: TutorDocumentType): string {
  const printable = [...(raw.split(/[\\/]/).pop() ?? '')]
    .filter((char) => char.charCodeAt(0) > 0x1f && char.charCodeAt(0) !== 0x7f)
    .join('');
  const base =
    printable
      .replace(/["<>:|?*]/g, '')
      .replace(/\.[^.]*$/, '')
      .trim()
      .slice(0, 100) || 'giay-to';
  return `${base}.${EXTENSIONS[type]}`;
}

export function documentKind(value: unknown): TutorDocumentKind {
  const kind = TUTOR_DOCUMENT_KINDS.find((item) => item === value);
  if (!kind) throw invalid('Loại giấy tờ không hợp lệ.');
  return kind;
}

export async function listDocuments(db: D1Database, tutorId: string): Promise<TutorDocument[]> {
  const { results } = await db
    .prepare(
      `SELECT id, kind, file_name AS fileName, content_type AS contentType,
         size_bytes AS sizeBytes, created_at AS createdAt
       FROM tutor_documents WHERE tutor_id = ? ORDER BY created_at, id`,
    )
    .bind(tutorId)
    .all<TutorDocument>();
  return results;
}

/** Multipart "file" plus "kind", with a request-size guard before parsing. */
export async function documentFromRequest(
  request: Request,
): Promise<{ file: File; kind: TutorDocumentKind }> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > TUTOR_DOCUMENT_MAX_BYTES + 64 * 1024) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Mỗi tệp tối đa 1,5 MB.');
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw invalid('Cần chọn tệp.');
  return { file, kind: documentKind(form?.get('kind')) };
}

/**
 * Stores an ID side (replacing the previous photo of that side) or adds a credential.
 * The tutor profile must exist; D1 limits credentials and keeps ID sides to images.
 */
export async function saveDocument(
  db: D1Database,
  tutorId: string,
  kind: TutorDocumentKind,
  file: File,
): Promise<TutorDocument> {
  if (file.size < 1) throw invalid('Tệp trống.');
  if (file.size > TUTOR_DOCUMENT_MAX_BYTES) throw invalid('Mỗi tệp tối đa 1,5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) throw invalid('Chỉ nhận ảnh JPG, PNG, WebP hoặc tệp PDF.');
  if (kind !== 'credential' && type === 'application/pdf')
    throw invalid('Ảnh CCCD chỉ nhận JPG, PNG hoặc WebP.');
  const profile = await db
    .prepare('SELECT 1 AS one FROM tutor_profiles WHERE user_id = ?')
    .bind(tutorId)
    .first();
  if (!profile) throw new AppError(409, 'PROFILE_NOT_FOUND', 'Hãy lưu hồ sơ trước khi tải tệp.');
  if (kind === 'credential') {
    const count = await db
      .prepare(
        "SELECT count(*) AS n FROM tutor_documents WHERE tutor_id = ? AND kind = 'credential'",
      )
      .bind(tutorId)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_TUTOR_CREDENTIALS)
      throw new AppError(
        409,
        'TUTOR_DOCUMENT_LIMIT',
        `Chỉ tải tối đa ${MAX_TUTOR_CREDENTIALS} tệp minh chứng.`,
      );
  }
  const document: TutorDocument = {
    id: crypto.randomUUID(),
    kind,
    fileName: cleanName(file.name, type),
    contentType: type,
    sizeBytes: bytes.byteLength,
    createdAt: new Date().toISOString(),
  };
  try {
    await db.batch([
      ...(kind === 'credential'
        ? []
        : [
            db
              .prepare('DELETE FROM tutor_documents WHERE tutor_id = ? AND kind = ?')
              .bind(tutorId, kind),
          ]),
      db
        .prepare(
          `INSERT INTO tutor_documents (id, tutor_id, kind, file_name, content_type, size_bytes, data, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          document.id,
          tutorId,
          kind,
          document.fileName,
          type,
          document.sizeBytes,
          bytes,
          document.createdAt,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
           VALUES (?, ?, 'profile.document_uploaded', 'user', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tutorId,
          tutorId,
          JSON.stringify({ documentId: document.id, kind }),
          document.createdAt,
        ),
    ]);
  } catch (error) {
    if (String(error).includes('TUTOR_DOCUMENT_LIMIT'))
      throw new AppError(
        409,
        'TUTOR_DOCUMENT_LIMIT',
        `Chỉ tải tối đa ${MAX_TUTOR_CREDENTIALS} tệp minh chứng.`,
      );
    throw error;
  }
  return document;
}

export async function deleteDocument(db: D1Database, tutorId: string, id: string): Promise<void> {
  const result = await db
    .prepare('DELETE FROM tutor_documents WHERE id = ? AND tutor_id = ?')
    .bind(id, tutorId)
    .run();
  if (!result.meta.changes) throw notFound();
}

/** Bytes for the owner or a moderator. Images open inline; PDFs always download. */
export async function documentResponse(
  db: D1Database,
  tutorId: string,
  id: string,
): Promise<Response> {
  const row = await db
    .prepare(
      `SELECT file_name AS fileName, content_type AS contentType, data
       FROM tutor_documents WHERE id = ? AND tutor_id = ?`,
    )
    .bind(id, tutorId)
    .first<{ fileName: string; contentType: TutorDocumentType; data: ArrayBuffer | number[] }>();
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
