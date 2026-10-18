import { Building2, Wallet } from 'lucide-react';
import { Navigate, useParams } from 'react-router';
import { PLACEMENT_FEE_WEEKS } from '../../../shared/schemas/classes';
import { ButtonLink } from '../../components/ui/Button';
import { Alert, Badge } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useTutorProposal } from '../../features/class-requests/api';
import { formatVnd } from '../../lib/format';
import { CENTRE_ADDRESS, CENTRE_PHONE } from './ClassAcceptancePanel';
import { canComplete, completionPath } from './ProposalParts';
import { BackLink } from './TutorClassPages';

/**
 * "Hoàn tất nhận lớp" from a proposal the learner chose. Once the centre has set up the class
 * for this tutor, its own completion screen takes over; until then the centre procedure shows.
 */
export function TutorProposalCompletePage() {
  const { proposalId } = useParams();
  const detail = useTutorProposal(proposalId);
  const back = `/tutor/class-requests/de-xuat/${encodeURIComponent(proposalId ?? '')}`;

  if (detail.isPending) return <PageLoading label="Đang tải thông tin lớp…" />;
  if (detail.isError)
    return (
      <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
        <BackLink to="/tutor/class-requests?tab=de-xuat" />
        <Alert tone="danger" title="Không tải được thông tin lớp">
          {detail.error.message}
        </Alert>
      </section>
    );
  const item = detail.data;
  if (canComplete(item) && item.applicationId)
    return <Navigate to={completionPath(item)} replace />;
  const rate = item.placementRateBasisPoints === null ? 40 : item.placementRateBasisPoints / 100;

  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <BackLink to={back} />
        <h1 className="text-3xl font-semibold text-primary">Hoàn tất nhận lớp</h1>
      </div>
      <article className="overflow-hidden rounded-2xl border border-border bg-bg shadow-card">
        <header className="flex flex-col gap-2 bg-primary px-6 py-6 text-on-primary sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-white/80">Mã yêu cầu: {item.requestCode}</p>
            <Badge tone="success">Người học đã chọn bạn</Badge>
          </div>
          <h2 className="text-3xl font-semibold">
            {item.subjectName} – {item.grade}
          </h2>
        </header>
        <div className="flex flex-col gap-5 px-6 py-6 text-sm leading-relaxed sm:px-8">
          {!canComplete(item) ? (
            <Alert tone="info">
              Bước hoàn tất nhận lớp chỉ có khi bạn đã xác nhận và người học đã chọn bạn.
            </Alert>
          ) : (
            <>
              <div className="flex gap-3 rounded-xl border border-accent bg-warning-surface p-4">
                <Wallet aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-warning" />
                <div>
                  <p className="text-muted">Phí nhận lớp</p>
                  <p className="text-2xl font-bold text-primary">
                    {item.placementFeeMinor === null
                      ? 'Trung tâm thông báo khi ký hợp đồng'
                      : formatVnd(item.placementFeeMinor)}
                  </p>
                  <p>
                    Cách tính: {rate}% × học phí/buổi × số buổi/tuần × {PLACEMENT_FEE_WEEKS}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 rounded-xl border border-border bg-surface p-4">
                <Building2 aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold text-primary">Thủ tục nhận lớp</p>
                  <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5">
                    <li>
                      Bạn sẽ đến văn phòng trung tâm tại <strong>{CENTRE_ADDRESS}</strong> để ký hợp
                      đồng cam kết và thanh toán phí nhận lớp. Gọi <strong>{CENTRE_PHONE}</strong>{' '}
                      để hẹn giờ.
                    </li>
                    <li>
                      Sau khi hoàn tất thủ tục, bạn sẽ nhận được thông tin liên hệ của phụ huynh và
                      thư giới thiệu từ trung tâm trong tab Lớp đã hoàn tất.
                    </li>
                  </ol>
                </div>
              </div>
              <p className="text-muted">
                Thông tin liên hệ chi tiết của phụ huynh chỉ được cung cấp sau khi bạn hoàn tất thủ
                tục nhận lớp theo quy định của trung tâm.
              </p>
            </>
          )}
        </div>
      </article>
      <ButtonLink to="/tutor/class-requests?tab=de-xuat" variant="secondary" className="self-start">
        Về danh sách lớp được đề xuất
      </ButtonLink>
    </section>
  );
}
