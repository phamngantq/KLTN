import { Building2, CircleCheck, Wallet } from 'lucide-react';
import { useState } from 'react';
import type { TutorProposalItem } from '../../../shared/schemas/class-requests';
import { PLACEMENT_FEE_WEEKS } from '../../../shared/schemas/classes';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert } from '../../components/ui/Feedback';
import { TextareaField } from '../../components/ui/Field';
import { useRespondToProposal } from '../../features/class-requests/api';
import { formatVnd, WEEKDAY_LABELS } from '../../lib/format';
import { CENTRE_ADDRESS } from './ClassAcceptancePanel';

export const TERMS_AGREEMENT =
  'Tôi xác nhận đã đọc và đồng ý với Điều khoản trách nhiệm của trung tâm.';

type Tone = 'info' | 'success' | 'danger' | 'neutral' | 'warning';

/** "Chờ phản hồi" / "Đã xác nhận" / "Đã từ chối" follow the tutor's own answer. */
export function proposalStatus(item: TutorProposalItem): { label: string; tone: Tone } {
  if (item.tutorResponse === 'declined') return { label: 'Đã từ chối', tone: 'danger' };
  if (item.tutorResponse === 'accepted') return { label: 'Đã xác nhận', tone: 'success' };
  if (item.status === 'proposed') return { label: 'Chờ phản hồi', tone: 'warning' };
  return { label: 'Đã đóng', tone: 'neutral' };
}

/** What happened on the learner's side, when it matters to the tutor. */
export function proposalNote(item: TutorProposalItem): string | null {
  if (item.status === 'selected')
    return 'Người học đã chọn bạn. Trung tâm sẽ liên hệ để hoàn tất thủ tục.';
  if (item.status === 'declined' && item.tutorResponse !== 'declined')
    return 'Người học đã chọn gia sư khác cho lớp này.';
  if (item.tutorResponse === 'accepted')
    return 'Trung tâm đã nhận xác nhận của bạn và sẽ thông báo khi người học chọn gia sư.';
  return null;
}

export const isPending = (item: TutorProposalItem) =>
  item.status === 'proposed' && item.tutorResponse === null;

export function proposalSchedule(item: TutorProposalItem): string {
  const head = item.sessionsPerWeek ? `${item.sessionsPerWeek} buổi/tuần` : null;
  const times = item.schedule
    .map(
      (window) =>
        `${WEEKDAY_LABELS[window.weekday] ?? window.weekday} ${window.startLocal}–${window.endLocal}`,
    )
    .join('; ');
  return [head, times || 'trao đổi lịch sau'].filter(Boolean).join(' · ');
}

/** "Từ chối nhận lớp": a reason is required before the decline is sent. Key it per proposal. */
export function DeclineProposalDialog({
  item,
  onClose,
}: {
  item: TutorProposalItem | null;
  onClose: () => void;
}) {
  const respond = useRespondToProposal();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function confirm() {
    if (!item || respond.isPending || isReadOnlyPreview()) return;
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do từ chối nhận lớp.');
      return;
    }
    respond.mutate({ id: item.id, accept: false, reason: reason.trim() }, { onSuccess: onClose });
  }

  return (
    <ConfirmDialog
      open={item !== null}
      title="Từ chối nhận lớp?"
      description={
        item
          ? `Lớp ${item.subjectName} · ${item.grade} (${item.requestCode}) sẽ chuyển sang trạng thái Đã từ chối. Hãy cho trung tâm biết lý do.`
          : ''
      }
      confirmLabel="Xác nhận từ chối"
      tone="danger"
      loading={respond.isPending}
      onConfirm={confirm}
      onCancel={onClose}
    >
      <TextareaField
        label="Lý do từ chối nhận lớp"
        required
        maxLength={500}
        value={reason}
        error={error || undefined}
        onChange={(event) => {
          setReason(event.target.value);
          setError('');
        }}
      />
      {respond.isError && <Alert tone="danger">{respond.error.message}</Alert>}
    </ConfirmDialog>
  );
}

/**
 * "Xác nhận nhận lớp": the fee, the centre procedure and the terms checkbox. The button stays
 * disabled until the tutor ticks the agreement; the server checks it again.
 */
export function ConfirmProposalPanel({
  item,
  onCancel,
}: {
  item: TutorProposalItem;
  onCancel: () => void;
}) {
  const respond = useRespondToProposal();
  const [agreed, setAgreed] = useState(false);
  const preview = isReadOnlyPreview();
  const rate = item.placementRateBasisPoints === null ? null : item.placementRateBasisPoints / 100;
  const sessions = item.sessionsPerWeek ?? (item.schedule.length || null);

  return (
    <section
      aria-label="Xác nhận nhận lớp"
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5"
    >
      <h3 className="text-xl font-semibold text-primary">Xác nhận nhận lớp</h3>
      <div className="flex gap-3 rounded-xl border border-accent bg-warning-surface p-4">
        <Wallet aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-warning" />
        <div>
          <p className="text-sm text-muted">Phí nhận lớp</p>
          <p className="text-2xl font-bold text-primary">
            {item.placementFeeMinor === null
              ? 'Trung tâm thông báo khi ký hợp đồng'
              : formatVnd(item.placementFeeMinor)}
          </p>
          <p className="mt-1 text-sm">
            Cách tính: {rate ?? 40}% × học phí/buổi × số buổi/tuần × {PLACEMENT_FEE_WEEKS}
            {item.expectedBudgetMinor !== null &&
              sessions &&
              ` = ${rate ?? 40}% × ${formatVnd(item.expectedBudgetMinor)} × ${sessions} × ${PLACEMENT_FEE_WEEKS}`}
          </p>
        </div>
      </div>
      <div>
        <h4 className="mb-3 font-semibold text-primary">Hướng dẫn thủ tục nhận lớp</h4>
        <ol className="flex flex-col gap-3 text-sm leading-relaxed">
          <li className="flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
              1
            </span>
            <span className="pt-1">
              <Building2 aria-hidden="true" className="mr-1 inline size-4 text-primary" />
              Bạn sẽ đến văn phòng trung tâm tại <strong>{CENTRE_ADDRESS}</strong> để ký hợp đồng
              cam kết và thanh toán phí nhận lớp.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
              2
            </span>
            <span className="pt-1">
              <CircleCheck aria-hidden="true" className="mr-1 inline size-4 text-success" />
              Sau khi hoàn tất thủ tục, bạn sẽ nhận được thông tin liên hệ của phụ huynh và thư giới
              thiệu từ trung tâm.
            </span>
          </li>
        </ol>
      </div>
      <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border bg-bg p-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--color-primary)]"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        {TERMS_AGREEMENT}
      </label>
      {respond.isError && <Alert tone="danger">{respond.error.message}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={!agreed || preview}
          loading={respond.isPending}
          onClick={() => respond.mutate({ id: item.id, accept: true })}
        >
          Xác nhận nhận lớp
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Quay lại
        </Button>
      </div>
    </section>
  );
}
