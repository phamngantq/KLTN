import { FileImage, FileText, Paperclip, X } from 'lucide-react';
import {
  COMPLAINT_ATTACHMENT_MAX_BYTES,
  COMPLAINT_ATTACHMENT_TYPES,
  type ComplaintAttachment,
} from '../../../shared/schemas/complaints';

export const ATTACHMENT_ACCEPT = COMPLAINT_ATTACHMENT_TYPES.join(',');

export function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Large photos are re-encoded in the browser so typical phone pictures fit the 1.5 MB limit.
 * PDFs and already-small files are sent unchanged; the Worker re-checks every file.
 */
export async function prepareEvidence(file: File): Promise<File> {
  if (!(COMPLAINT_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(`${file.name}: chỉ nhận ảnh JPG, PNG, WebP hoặc tệp PDF.`);
  }
  if (file.size <= COMPLAINT_ATTACHMENT_MAX_BYTES) return file;
  if (file.type === 'application/pdf' || typeof createImageBitmap !== 'function') {
    throw new Error(`${file.name}: mỗi tệp tối đa 1,5 MB.`);
  }
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
  if (!blob || blob.size > COMPLAINT_ATTACHMENT_MAX_BYTES) {
    throw new Error(`${file.name}: ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn 1,5 MB.`);
  }
  return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** Evidence links; `basePath` is the complaint path the viewer may read from. */
export function AttachmentLinks({
  attachments,
  basePath,
}: {
  attachments: ComplaintAttachment[];
  basePath: string;
}) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1 text-sm font-semibold text-primary">
        <Paperclip aria-hidden="true" className="size-4" />
        Minh chứng đính kèm
      </p>
      <ul className="flex flex-col gap-1">
        {attachments.map((item) => {
          const Icon = item.contentType === 'application/pdf' ? FileText : FileImage;
          return (
            <li key={item.id}>
              <a
                href={`/api/v1${basePath}/attachments/${encodeURIComponent(item.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 text-sm text-primary underline underline-offset-4"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="break-all">{item.fileName}</span>
                <span className="text-xs text-muted no-underline">
                  ({fileSize(item.sizeBytes)})
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PendingFile({
  name,
  size,
  onRemove,
  disabled,
}: {
  name: string;
  size: number;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1 text-sm">
      <Paperclip aria-hidden="true" className="size-4 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 break-all">{name}</span>
      <span className="text-xs text-muted">{fileSize(size)}</span>
      <button
        type="button"
        aria-label={`Bỏ tệp ${name}`}
        disabled={disabled}
        onClick={onRemove}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-danger hover:bg-danger-surface focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}
