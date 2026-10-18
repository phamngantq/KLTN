import { Check, ClipboardCheck, Copy, FileText, QrCode, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { PaymentInstructions } from '../../../shared/schemas/class-requests';
import { isReadOnlyPreview } from '../../app/preview';
import { VietQrCode } from '../../components/domain/VietQrCode';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useOwnApplication,
  usePaymentInstructions,
  useReportTransfer,
} from '../../features/class-requests/api';
import { formatDate, formatVnd } from '../../lib/format';
import { CENTRE_PHONE, ClassAcceptancePanel } from './ClassAcceptancePanel';
import { BackLink } from './TutorClassPages';

const BACK = '/tutor/class-requests';
const CONTRACT_AGREEMENT = 'Tôi đã đọc và đồng ý với các điều khoản trong hợp đồng';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="gap-2"
      aria-label={label}
      onClick={() =>
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => setCopied(false))
      }
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4 text-success" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      {copied ? 'Đã sao chép' : 'Sao chép'}
    </Button>
  );
}

/**
 * Returning tutor: pay the exact placement fee of this class by bank transfer (VietQR), agree to
 * the contract and report the transfer. The centre confirms receipt before contact opens.
 */
export function PaymentScreen({ payment }: { payment: PaymentInstructions }) {
  const report = useReportTransfer();
  const [agreed, setAgreed] = useState(false);
  const preview = isReadOnlyPreview();
  const amount = payment.amountMinor === null ? null : formatVnd(payment.amountMinor);
  const contractDone = payment.contract?.status === 'acknowledged';
  const blocked = !payment.learnerConfirmed
    ? 'Chờ người học xác nhận thuê gia sư trước khi thanh toán.'
    : !payment.contract || !payment.assignmentId
      ? 'Trung tâm đang chuẩn bị hợp đồng cho lớp này. Vui lòng quay lại sau.'
      : !payment.account || !payment.qrPayload
        ? `Trung tâm chưa cấu hình tài khoản nhận thanh toán nên chưa tạo được mã QR. Vui lòng liên hệ ${CENTRE_PHONE}.`
        : null;

  if (payment.reportedAt)
    return (
      <Alert tone="info" title="Đã ghi nhận bạn chuyển khoản phí nhận lớp">
        Bạn báo chuyển khoản lúc {formatDate(payment.reportedAt, 'Asia/Ho_Chi_Minh')}. Trung tâm
        đang đối soát; khi xác nhận đã nhận phí, thông tin liên hệ người học và thư giới thiệu sẽ có
        trong tab{' '}
        <Link to="/tutor/class-requests?tab=hoan-tat" className="font-semibold underline">
          Lớp đã hoàn tất
        </Link>
        .
      </Alert>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="pay-guide" className="flex flex-col gap-5">
          <h3 id="pay-guide" className="text-xl font-semibold text-primary">
            Hướng dẫn thanh toán
          </h3>
          <ol className="flex flex-col gap-3 text-sm leading-relaxed">
            {[
              'Mở ứng dụng ngân hàng hoặc ví điện tử, chọn quét mã QR và quét mã bên cạnh.',
              'Kiểm tra đúng số tiền và nội dung chuyển khoản như dưới đây, rồi xác nhận chuyển.',
              'Đọc hợp đồng, tích đồng ý với các điều khoản và bấm “Tôi đã chuyển khoản – Hoàn tất nhận lớp”.',
              'Trung tâm đối soát và xác nhận đã nhận phí; thông tin liên hệ người học và thư giới thiệu sẽ hiển thị trong tab Lớp đã hoàn tất.',
            ].map((text, index) => (
              <li key={text} className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                  {index + 1}
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ol>
          <dl className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
            <div>
              <dt className="flex items-center gap-2 text-sm text-muted">
                <Wallet aria-hidden="true" className="size-4" />
                Số tiền cần thanh toán
              </dt>
              <dd className="text-3xl font-bold text-primary">
                {amount ?? 'Trung tâm sẽ thông báo'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Nội dung chuyển khoản</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-3">
                <code className="rounded-md border border-border bg-bg px-3 py-2 text-base font-semibold">
                  {payment.transferContent}
                </code>
                <CopyButton text={payment.transferContent} label="Sao chép nội dung chuyển khoản" />
              </dd>
            </div>
            {payment.account && (
              <div className="grid gap-1 text-sm sm:grid-cols-[9rem_1fr]">
                <dt className="text-muted">Ngân hàng</dt>
                <dd className="font-medium">{payment.account.bankName}</dd>
                <dt className="text-muted">Số tài khoản</dt>
                <dd className="flex flex-wrap items-center gap-2 font-medium">
                  {payment.account.accountNumber}
                  <CopyButton text={payment.account.accountNumber} label="Sao chép số tài khoản" />
                </dd>
                <dt className="text-muted">Chủ tài khoản</dt>
                <dd className="font-medium">{payment.account.accountName}</dd>
              </div>
            )}
          </dl>
        </section>
        <section
          aria-labelledby="pay-qr"
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-bg p-5 shadow-card"
        >
          <h3 id="pay-qr" className="flex items-center gap-2 font-semibold text-primary">
            <QrCode aria-hidden="true" className="size-5" />
            Mã QR thanh toán
          </h3>
          {payment.qrPayload ? (
            <>
              <div className="size-64 max-w-full">
                <VietQrCode
                  payload={payment.qrPayload}
                  label={`Mã VietQR chuyển ${amount ?? ''} với nội dung ${payment.transferContent}`}
                />
              </div>
              <p className="text-center text-xs text-muted">
                VietQR · {amount} · {payment.transferContent}
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-muted">
              Chưa có mã QR: trung tâm chưa cấu hình tài khoản nhận thanh toán.
            </p>
          )}
        </section>
      </div>
      <section
        aria-labelledby="pay-contract"
        className="flex flex-col gap-4 border-t border-border pt-6"
      >
        <h3 id="pay-contract" className="text-xl font-semibold text-primary">
          Xác nhận hợp đồng
        </h3>
        <Link
          to="/tutor/contracts"
          className="inline-flex w-fit items-center gap-2 text-primary underline"
        >
          <FileText aria-hidden="true" className="size-4" />
          Xem nội dung hợp đồng nhận lớp
        </Link>
        {contractDone && (
          <p className="text-sm text-success">Bạn đã xác nhận hợp đồng của lớp này.</p>
        )}
        <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border bg-bg p-4 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          {CONTRACT_AGREEMENT}
        </label>
        {blocked && <Alert tone="warning">{blocked}</Alert>}
        {!agreed && !blocked && (
          <p className="text-sm text-muted" role="status">
            Vui lòng tích chọn đồng ý với các điều khoản trong hợp đồng để tiếp tục.
          </p>
        )}
        {report.isError && <Alert tone="danger">{report.error.message}</Alert>}
        <Button
          className="gap-2 self-start"
          disabled={!agreed || Boolean(blocked) || preview}
          loading={report.isPending}
          onClick={() => payment.assignmentId && report.mutate(payment.assignmentId)}
        >
          <ClipboardCheck aria-hidden="true" className="size-4" />
          Tôi đã chuyển khoản – Hoàn tất nhận lớp
        </Button>
        <p className="text-sm text-muted">
          Thông tin liên hệ chi tiết của người học và thư giới thiệu chỉ được cung cấp sau khi trung
          tâm xác nhận đã nhận phí.
        </p>
      </section>
    </div>
  );
}

function ReturningTutorPayment({ assignmentId }: { assignmentId: string }) {
  const payment = usePaymentInstructions(assignmentId);
  if (payment.isPending) return <PageLoading label="Đang tải thông tin thanh toán…" />;
  if (payment.isError)
    return (
      <Alert
        tone="danger"
        title="Không tải được thông tin thanh toán"
        action={
          <Button variant="secondary" onClick={() => void payment.refetch()}>
            Thử lại
          </Button>
        }
      >
        {payment.error.message}
      </Alert>
    );
  return <PaymentScreen payment={payment.data} />;
}

/** "Hoàn tất nhận lớp" (full body): centre guidance for a first class, payment for later ones. */
export function TutorCompleteAcceptancePage() {
  const { applicationId } = useParams();
  const detail = useOwnApplication(applicationId);

  if (detail.isPending) return <PageLoading label="Đang tải thông tin lớp…" />;
  if (detail.isError)
    return (
      <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
        <BackLink to={BACK} />
        <Alert tone="danger" title="Không tải được thông tin lớp">
          {detail.error.message}
        </Alert>
      </section>
    );
  const application = detail.data;
  const acceptance = application.acceptance;
  const item = application.class;

  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <BackLink to={`/tutor/class-requests/chi-tiet/${encodeURIComponent(application.id)}`} />
        <h1 className="text-3xl font-semibold text-primary">Hoàn tất nhận lớp</h1>
      </div>
      <article className="overflow-hidden rounded-2xl border border-border bg-bg shadow-card">
        <header className="flex flex-col gap-2 bg-primary px-6 py-6 text-on-primary sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-white/80">Mã lớp: {item.code}</p>
            {acceptance && (
              <Badge tone="info">
                {acceptance.firstAcceptance ? 'Nhận lớp lần đầu' : 'Đã từng nhận lớp'}
              </Badge>
            )}
          </div>
          <h2 className="text-3xl font-semibold">
            {item.subjectName} – {item.grade}
          </h2>
        </header>
        <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
          {application.status !== 'selected' || !acceptance ? (
            <Alert tone="info">Chỉ lớp ở trạng thái Đã duyệt mới có bước hoàn tất nhận lớp.</Alert>
          ) : acceptance.completed ? (
            <Alert tone="success" title="Đã hoàn tất nhận lớp">
              Thông tin liên hệ người học và thư giới thiệu có trong tab{' '}
              <Link to="/tutor/class-requests?tab=hoan-tat" className="font-semibold underline">
                Lớp đã hoàn tất
              </Link>
              .
            </Alert>
          ) : !acceptance.assignmentActive ? (
            <Alert tone="warning" title="Lớp không còn hiệu lực">
              Lớp đã kết thúc hoặc trung tâm đã rút gán. Vui lòng liên hệ trung tâm nếu cần hỗ trợ.
            </Alert>
          ) : acceptance.firstAcceptance ? (
            <ClassAcceptancePanel feeMinor={acceptance.placementFeeMinor} classCode={item.code} />
          ) : (
            <ReturningTutorPayment assignmentId={acceptance.assignmentId} />
          )}
        </div>
      </article>
      <ButtonLink to={BACK} variant="secondary" className="self-start">
        Về danh sách lớp đã đăng ký
      </ButtonLink>
    </section>
  );
}
