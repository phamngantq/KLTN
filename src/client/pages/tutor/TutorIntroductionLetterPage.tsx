import { ArrowLeft, Printer } from 'lucide-react';
import { useParams } from 'react-router';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useIntroductionLetter } from '../../features/class-requests/api';
import { formatDate, formatVnd } from '../../lib/format';

const BACK = '/tutor/class-requests?tab=hoan-tat';

/**
 * "Thư giới thiệu": printable (or "Lưu dưới dạng PDF" from the print dialog). The server returns
 * it only after every acceptance condition is met; nothing here is cached once the page closes.
 */
export function TutorIntroductionLetterPage() {
  const { assignmentId } = useParams();
  const letter = useIntroductionLetter(assignmentId);

  return (
    <section className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ButtonLink to={BACK} variant="secondary" className="gap-2">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Lớp đã hoàn tất
        </ButtonLink>
        {letter.isSuccess && (
          <Button onClick={() => window.print()} className="gap-2">
            <Printer aria-hidden="true" className="size-4" />
            In / Lưu PDF
          </Button>
        )}
      </div>
      {letter.isPending ? (
        <PageLoading label="Đang tải thư giới thiệu…" />
      ) : letter.isError ? (
        <Alert tone="warning" title="Chưa có thư giới thiệu">
          {letter.error.message}
        </Alert>
      ) : (
        <article
          aria-label="Thư giới thiệu"
          className="flex flex-col gap-6 rounded-2xl border border-border bg-bg p-8 leading-relaxed shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
          <header className="flex flex-col gap-1 border-b border-border pb-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Trung tâm Gia sư Sư phạm Đỗ Hằng
            </p>
            <p className="text-sm text-muted">
              Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội · 0394 618 480
            </p>
            <h1 className="mt-4 text-2xl font-bold text-primary">THƯ GIỚI THIỆU GIA SƯ</h1>
            <p className="text-sm text-muted">
              Số: {letter.data.letterNumber} · Ngày{' '}
              {formatDate(letter.data.issuedAt, 'Asia/Ho_Chi_Minh')}
            </p>
          </header>
          <p>
            Kính gửi: <strong>{letter.data.learnerDisplayName}</strong>
          </p>
          <p>
            Trung tâm Gia sư Sư phạm Đỗ Hằng trân trọng giới thiệu gia sư{' '}
            <strong>{letter.data.tutorDisplayName}</strong> đến nhận lớp theo yêu cầu của Quý phụ
            huynh/học viên với thông tin như sau:
          </p>
          <dl className="grid gap-2 rounded-xl border border-border p-4 text-sm sm:grid-cols-[11rem_1fr]">
            <dt className="font-medium text-muted">Mã lớp</dt>
            <dd>{letter.data.classCode}</dd>
            <dt className="font-medium text-muted">Môn học · Lớp</dt>
            <dd>
              {letter.data.subjectName} · {letter.data.grade}
            </dd>
            <dt className="font-medium text-muted">Hình thức</dt>
            <dd>
              {letter.data.mode === 'online'
                ? 'Trực tuyến'
                : `Trực tiếp · ${letter.data.publicArea ?? ''}`}
            </dd>
            {letter.data.sessionsPerWeek !== null && (
              <>
                <dt className="font-medium text-muted">Số buổi</dt>
                <dd>{letter.data.sessionsPerWeek} buổi/tuần</dd>
              </>
            )}
            <dt className="font-medium text-muted">Học phí đã thống nhất</dt>
            <dd>
              {letter.data.agreedTuitionPerSessionMinor === null
                ? 'Theo thỏa thuận'
                : `${formatVnd(letter.data.agreedTuitionPerSessionMinor)}/buổi`}
            </dd>
            <dt className="font-medium text-muted">Người học</dt>
            <dd>{letter.data.learnerDisplayName}</dd>
            <dt className="font-medium text-muted">Điện thoại</dt>
            <dd>{letter.data.learnerPhone}</dd>
            <dt className="font-medium text-muted">Địa chỉ</dt>
            <dd>{letter.data.learnerAddress ?? 'Trao đổi trực tiếp với người học'}</dd>
          </dl>
          <p>
            Gia sư đã hoàn tất thủ tục nhận lớp và cam kết thực hiện đúng các thỏa thuận đã thống
            nhất. Mọi thay đổi về lịch học, học phí hoặc người dạy xin vui lòng thông báo cho trung
            tâm để được hỗ trợ kịp thời.
          </p>
          <p>Trân trọng cảm ơn Quý phụ huynh/học viên đã tin tưởng trung tâm.</p>
          <footer className="flex justify-end pt-4">
            <div className="text-center text-sm">
              <p className="font-semibold">TRUNG TÂM GIA SƯ SƯ PHẠM ĐỖ HẰNG</p>
              <p className="text-muted">(Thư được phát hành trên hệ thống)</p>
            </div>
          </footer>
        </article>
      )}
    </section>
  );
}
