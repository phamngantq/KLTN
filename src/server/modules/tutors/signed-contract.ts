import {
  TUTOR_DOCUMENT_MAX_BYTES,
  type SignedContractScan,
  type TutorDocumentType,
} from '../../../shared/schemas/tutors';
import { AppError } from '../../lib/errors';
import { cleanName, sniff } from './documents';

const invalid = (path: string, message: string) =>
  new AppError(422, 'SIGNED_CONTRACT_INVALID', message, [{ path, message }]);
const notFound = () =>
  new AppError(404, 'SIGNED_CONTRACT_NOT_FOUND', 'Trung tâm chưa tải lên hợp đồng đã ký.');

/** Metadata of the tutor's signed-contract scan, or null before the centre uploads it. */
export async function getSignedContract(
  db: D1Database,
  tutorId: string,
): Promise<SignedContractScan | null> {
  return db
    .prepare(
      `SELECT contract_number AS contractNumber, signed_on AS signedOn, file_name AS fileName,
         content_type AS contentType, size_bytes AS sizeBytes, uploaded_at AS uploadedAt
       FROM tutor_signed_contracts WHERE tutor_id = ?`,
    )
    .bind(tutorId)
    .first<SignedContractScan>();
}

/** Multipart "file", "signedOn" (yyyy-mm-dd) and optional "contractNumber". */
export async function scanFromRequest(request: Request) {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > TUTOR_DOCUMENT_MAX_BYTES + 64 * 1024)
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Tệp hợp đồng tối đa 1,5 MB.');
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw invalid('file', 'Cần chọn tệp hợp đồng đã scan.');
  const signedOn = String(form?.get('signedOn') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signedOn) || Number.isNaN(Date.parse(signedOn)))
    throw invalid('signedOn', 'Cần nhập ngày ký hợp đồng.');
  if (signedOn > new Date().toISOString().slice(0, 10))
    throw invalid('signedOn', 'Ngày ký không được sau hôm nay.');
  const number = String(form?.get('contractNumber') ?? '').trim();
  if (number.length > 40) throw invalid('contractNumber', 'Số hợp đồng tối đa 40 ký tự.');
  return { file, signedOn, contractNumber: number || null };
}

/** Stores or replaces the scan for an approved-profile tutor; D1 checks the uploader is a moderator. */
export async function saveSignedContract(
  db: D1Database,
  moderatorId: string,
  tutorId: string,
  input: { file: File; signedOn: string; contractNumber: string | null },
): Promise<SignedContractScan> {
  const { file } = input;
  if (file.size < 1) throw invalid('file', 'Tệp trống.');
  if (file.size > TUTOR_DOCUMENT_MAX_BYTES) throw invalid('file', 'Tệp hợp đồng tối đa 1,5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) throw invalid('file', 'Chỉ nhận tệp PDF hoặc ảnh JPG, PNG, WebP.');
  const profile = await db
    .prepare('SELECT 1 AS one FROM tutor_profiles WHERE user_id = ?')
    .bind(tutorId)
    .first();
  if (!profile) throw new AppError(404, 'TUTOR_NOT_FOUND', 'Không tìm thấy hồ sơ gia sư.');
  const now = new Date().toISOString();
  const scan: SignedContractScan = {
    contractNumber: input.contractNumber,
    signedOn: input.signedOn,
    fileName: cleanName(file.name, type),
    contentType: type,
    sizeBytes: bytes.byteLength,
    uploadedAt: now,
  };
  await db.batch([
    db
      .prepare(
        `INSERT INTO tutor_signed_contracts (tutor_id, contract_number, signed_on, file_name,
           content_type, size_bytes, data, uploaded_by, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (tutor_id) DO UPDATE SET contract_number = excluded.contract_number,
           signed_on = excluded.signed_on, file_name = excluded.file_name,
           content_type = excluded.content_type, size_bytes = excluded.size_bytes,
           data = excluded.data, uploaded_by = excluded.uploaded_by,
           uploaded_at = excluded.uploaded_at`,
      )
      .bind(
        tutorId,
        scan.contractNumber,
        scan.signedOn,
        scan.fileName,
        type,
        scan.sizeBytes,
        bytes,
        moderatorId,
        now,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
         VALUES (?, ?, 'tutor.signed_contract_uploaded', 'user', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        moderatorId,
        tutorId,
        JSON.stringify({ fileName: scan.fileName, signedOn: scan.signedOn }),
        now,
      ),
  ]);
  return scan;
}

/** The scan's bytes for the tutor or a moderator; `inline` opens it in the browser. */
export async function signedContractResponse(
  db: D1Database,
  tutorId: string,
  inline: boolean,
): Promise<Response> {
  const row = await db
    .prepare(
      `SELECT file_name AS fileName, content_type AS contentType, data
       FROM tutor_signed_contracts WHERE tutor_id = ?`,
    )
    .bind(tutorId)
    .first<{ fileName: string; contentType: TutorDocumentType; data: ArrayBuffer | number[] }>();
  if (!row) throw notFound();
  const body = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data).buffer;
  return new Response(body, {
    headers: {
      'Content-Type': row.contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
