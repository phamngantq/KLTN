import { Navigate, useParams } from 'react-router';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useProposalPayment, useTutorProposal } from '../../features/class-requests/api';
import { ClassAcceptancePanel } from './ClassAcceptancePanel';
import { canComplete, completionPath } from './ProposalParts';
import { BackLink } from './TutorClassPages';
import { PaymentScreen } from './TutorCompleteAcceptancePage';

const BACK = '/tutor/class-requests?tab=de-xuat';

/**
 * "Hoàn tất nhận lớp" from a proposal the learner chose — the same screen as for an approved
 * class: centre guidance for a first class, payment (VietQR, contract agreement) for later
 * ones. Once the centre has set the class up, its own completion screen takes over.
 */
export function TutorProposalCompletePage() {
  const { proposalId } = useParams();
  const detail = useTutorProposal(proposalId);
  const chosen = detail.data ? canComplete(detail.data) : false;
  const payment = useProposalPayment(proposalId, chosen && !detail.data?.applicationId);

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
  const item = detail.data;
  if (chosen && item.applicationId) return <Navigate to={completionPath(item)} replace />;

  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <BackLink to={`/tutor/class-requests/de-xuat/${encodeURIComponent(item.id)}`} />
        <h1 className="text-3xl font-semibold text-primary">Hoàn tất nhận lớp</h1>
      </div>
      <article className="overflow-hidden rounded-2xl border border-border bg-bg shadow-card">
        <header className="flex flex-col gap-2 bg-primary px-6 py-6 text-on-primary sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-white/80">Mã yêu cầu: {item.requestCode}</p>
            {payment.data && (
              <Badge tone="info">
                {payment.data.firstAcceptance ? 'Nhận lớp lần đầu' : 'Đã từng nhận lớp'}
              </Badge>
            )}
          </div>
          <h2 className="text-3xl font-semibold">
            {item.subjectName} – {item.grade}
          </h2>
        </header>
        <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
          {!chosen ? (
            <Alert tone="info">
              Bước hoàn tất nhận lớp chỉ có khi bạn đã xác nhận và người học đã chọn bạn.
            </Alert>
          ) : payment.isPending ? (
            <PageLoading label="Đang tải thông tin thanh toán…" />
          ) : payment.isError ? (
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
          ) : payment.data.firstAcceptance ? (
            <ClassAcceptancePanel
              feeMinor={payment.data.amountMinor}
              classCode={payment.data.classCode}
            />
          ) : (
            <PaymentScreen payment={payment.data} />
          )}
        </div>
      </article>
      <ButtonLink to={BACK} variant="secondary" className="self-start">
        Về danh sách lớp được đề xuất
      </ButtonLink>
    </section>
  );
}
