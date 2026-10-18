import { Download, ExternalLink, FileText } from 'lucide-react';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useSignedContract } from '../../features/tutor-profile/api';
import { formatDate } from '../../lib/format';

const FILE = '/api/v1/tutor/profile/signed-contract/file';

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** yyyy-mm-dd → dd/mm/yyyy. */
function dayText(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * "Hợp đồng đã ký": the paper contract the tutor signed at the centre, scanned and uploaded by a
 * moderator. One contract per tutor (Điều 1.1), valid for every class taken afterwards.
 */
export function TutorContractsPage() {
  const scan = useSignedContract();

  return (
    <section className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold text-primary">Hợp đồng đã ký</h1>
        <p className="mt-2 text-muted">
          Bản scan hợp đồng bạn đã ký trực tiếp tại trung tâm. Bạn chỉ ký một lần; hợp đồng áp dụng
          cho mọi lớp nhận sau đó.
        </p>
      </header>
      {scan.isPending ? (
        <PageLoading label="Đang tải hợp đồng…" />
      ) : scan.isError ? (
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" onClick={() => void scan.refetch()}>
              Thử lại
            </Button>
          }
        >
          {scan.error.message}
        </Alert>
      ) : !scan.data ? (
        <EmptyState
          title="Trung tâm chưa tải lên hợp đồng đã ký"
          description="Bạn ký hợp đồng trực tiếp tại văn phòng trung tâm (Tầng 7, Số 41–43 Khuất Duy Tiến, Thanh Xuân, Hà Nội). Sau khi ký, quản lý sẽ tải bản scan lên đây."
          action={<ButtonLink to="/tutor/hop-dong-mau">Xem hợp đồng mẫu</ButtonLink>}
        />
      ) : (
        <article
          aria-label="Bản scan hợp đồng đã ký"
          className="overflow-hidden rounded-2xl border border-border bg-bg shadow-card"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-surface px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-bg text-primary">
                <FileText aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-primary">Hợp đồng nhận lớp dạy gia sư</h2>
                <dl className="mt-1 grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted">Số hợp đồng</dt>
                  <dd>{scan.data.contractNumber ?? 'Không ghi'}</dd>
                  <dt className="text-muted">Ngày ký</dt>
                  <dd>{dayText(scan.data.signedOn)}</dd>
                  <dt className="text-muted">Tệp</dt>
                  <dd className="break-all">
                    {scan.data.fileName} · {sizeText(scan.data.sizeBytes)}
                  </dd>
                  <dt className="text-muted">Tải lên ngày</dt>
                  <dd>{formatDate(scan.data.uploadedAt, 'Asia/Ho_Chi_Minh')}</dd>
                </dl>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={FILE}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-primary px-4 font-medium text-primary hover:bg-primary hover:text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                Mở toàn màn hình
              </a>
              <a
                href={`${FILE}?download=1`}
                download={scan.data.fileName}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 font-medium text-on-primary hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <Download aria-hidden="true" className="size-4" />
                Tải về
              </a>
            </div>
          </div>
          <div className="bg-surface p-4">
            {scan.data.contentType === 'application/pdf' ? (
              <iframe
                title="Bản scan hợp đồng đã ký"
                src={FILE}
                className="h-[80vh] w-full rounded-lg border border-border bg-white"
              />
            ) : (
              <img
                src={`${FILE}?v=${encodeURIComponent(scan.data.uploadedAt)}`}
                alt="Bản scan hợp đồng đã ký"
                className="mx-auto max-h-[80vh] w-auto rounded-lg border border-border bg-white"
              />
            )}
          </div>
        </article>
      )}
    </section>
  );
}
