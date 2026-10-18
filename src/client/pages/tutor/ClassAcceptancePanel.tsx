import { useQueryClient } from '@tanstack/react-query';
import { Building2, Circle, CircleCheck, CreditCard, Landmark } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ApplicationAcceptance } from '../../../shared/schemas/classes';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { Alert, Badge } from '../../components/ui/Feedback';
import { useStartPlacementFeePayment } from '../../features/class-requests/api';
import { useAcknowledgeContract } from '../../features/terms-contracts/api';
import { formatVnd } from '../../lib/format';

export const CENTRE_ADDRESS = 'Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội';
export const CENTRE_PHONE = '0394 618 480';

function Step({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {done ? (
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
      )}
      <span className={done ? 'text-fg' : 'text-muted'}>
        {children}
        <span className="sr-only">{done ? ' (đã xong)' : ' (chưa xong)'}</span>
      </span>
    </li>
  );
}

/**
 * "Hoàn tất nhận lớp" for an approved class. A first-time tutor signs the contract and pays at
 * the centre; a returning tutor confirms the contract and pays online. Completion is decided by
 * the server only — learner contact and the letter appear in "Lớp đã hoàn tất" afterwards.
 */
export function ClassAcceptancePanel({
  acceptance,
  classCode,
}: {
  acceptance: ApplicationAcceptance;
  classCode: string;
}) {
  const queryClient = useQueryClient();
  const acknowledge = useAcknowledgeContract();
  const payment = useStartPlacementFeePayment();
  const [agreed, setAgreed] = useState(false);
  const preview = isReadOnlyPreview();
  const fee =
    acceptance.placementFeeMinor === null
      ? 'theo thông báo của trung tâm'
      : formatVnd(acceptance.placementFeeMinor);
  const contractDone = acceptance.contract?.status === 'acknowledged';
  const paid = acceptance.placementFeePaidAt !== null;

  /** Every tab reads the same server state, so a step done here shows everywhere. */
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['classes', 'applications'] });
    void queryClient.invalidateQueries({ queryKey: ['tutor-class-requests'] });
  }

  if (acceptance.completed)
    return (
      <Alert tone="success" title="Đã hoàn tất nhận lớp">
        Thông tin liên hệ người học và thư giới thiệu có trong tab{' '}
        <Link to="/tutor/class-requests?tab=hoan-tat" className="font-semibold underline">
          Lớp đã hoàn tất
        </Link>
        .
      </Alert>
    );
  if (!acceptance.assignmentActive)
    return (
      <Alert tone="warning" title="Lớp không còn hiệu lực">
        Lớp đã kết thúc hoặc trung tâm đã rút gán. Vui lòng liên hệ trung tâm nếu cần hỗ trợ.
      </Alert>
    );

  return (
    <section
      aria-label="Hoàn tất nhận lớp"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-primary">Hoàn tất nhận lớp</h3>
        <Badge tone="info">
          {acceptance.firstAcceptance ? 'Nhận lớp lần đầu' : 'Đã từng nhận lớp'}
        </Badge>
      </div>
      <p>
        Phí nhận lớp: <strong className="text-primary">{fee}</strong>
      </p>
      <ul className="flex flex-col gap-1.5">
        <Step done={acceptance.learnerConfirmed}>Người học xác nhận thuê gia sư</Step>
        <Step done={contractDone}>
          {acceptance.firstAcceptance
            ? 'Ký hợp đồng nhận lớp tại trung tâm'
            : 'Xác nhận hợp đồng nhận lớp trên hệ thống'}
        </Step>
        <Step done={paid}>
          {acceptance.firstAcceptance
            ? 'Thanh toán phí nhận lớp — trung tâm xác nhận đã nhận'
            : 'Thanh toán phí nhận lớp trực tuyến'}
        </Step>
      </ul>

      {acceptance.firstAcceptance ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 rounded-lg border border-accent bg-warning-surface p-4 leading-relaxed">
            <Building2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold text-primary">Đến trung tâm ký hợp đồng</p>
              <p className="mt-1">
                Địa chỉ: <strong>{CENTRE_ADDRESS}</strong>
              </p>
              <p>
                Điện thoại: <strong>{CENTRE_PHONE}</strong> (gọi trước để hẹn giờ)
              </p>
              <p className="mt-1">
                Mang theo CCCD và các giấy tờ đã khai trong hồ sơ gia sư để ký hợp đồng nhận lớp.
              </p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border border-border bg-bg p-4 leading-relaxed">
            <Landmark aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-primary">Hướng dẫn thanh toán phí nhận lớp</p>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                <li>
                  Số tiền: <strong>{fee}</strong>.
                </li>
                <li>
                  Thanh toán tiền mặt tại trung tâm khi ký hợp đồng, hoặc chuyển khoản vào tài khoản
                  trung tâm do nhân viên cung cấp.
                </li>
                <li>
                  Nội dung chuyển khoản: <strong>{classCode} – Họ tên gia sư</strong>.
                </li>
              </ul>
            </div>
          </div>
          <p>
            Trung tâm chỉ xác nhận hoàn tất nhận lớp sau khi bạn đã ký hợp đồng và trung tâm ghi
            nhận đã nhận đủ phí.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-primary">Bước 1. Xác nhận hợp đồng</p>
            {!acceptance.contract ? (
              <p className="text-muted">Trung tâm đang chuẩn bị hợp đồng cho lớp này.</p>
            ) : contractDone ? (
              <p className="text-success">Bạn đã xác nhận hợp đồng.</p>
            ) : (
              <>
                <Link to="/tutor/contracts" className="w-fit text-primary underline">
                  Xem nội dung hợp đồng
                </Link>
                <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border bg-bg p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--color-primary)]"
                    checked={agreed}
                    onChange={(event) => setAgreed(event.target.checked)}
                  />
                  Tôi đã đọc và đồng ý với hợp đồng nhận lớp của trung tâm
                </label>
                {acknowledge.isError && <Alert tone="danger">{acknowledge.error.message}</Alert>}
                <Button
                  className="self-start"
                  disabled={!agreed || preview || !acceptance.learnerConfirmed}
                  loading={acknowledge.isPending}
                  onClick={() =>
                    acceptance.contract &&
                    acknowledge.mutate(
                      { id: acceptance.contract.id, version: acceptance.contract.version },
                      { onSuccess: refresh },
                    )
                  }
                >
                  Xác nhận hợp đồng
                </Button>
                {!acceptance.learnerConfirmed && (
                  <p className="text-muted">Chờ người học xác nhận thuê trước khi ký hợp đồng.</p>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-primary">Bước 2. Thanh toán phí nhận lớp</p>
            <p>
              Số tiền: <strong className="text-primary">{fee}</strong>
            </p>
            {!acceptance.onlinePaymentReady && (
              <p className="text-muted">
                Cổng thanh toán trực tuyến chưa được cấu hình. Vui lòng liên hệ trung tâm (
                {CENTRE_PHONE}) để thanh toán.
              </p>
            )}
            {payment.isError && <Alert tone="danger">{payment.error.message}</Alert>}
            <Button
              className="gap-2 self-start"
              disabled={
                !acceptance.onlinePaymentReady ||
                !contractDone ||
                !acceptance.learnerConfirmed ||
                paid ||
                preview
              }
              loading={payment.isPending}
              onClick={() =>
                payment.mutate(acceptance.assignmentId, {
                  onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
                  onError: refresh,
                })
              }
            >
              <CreditCard aria-hidden="true" className="size-4" />
              Thanh toán phí nhận lớp
            </Button>
          </div>
        </div>
      )}
      <p className="text-muted">
        Thông tin liên hệ chi tiết của người học và thư giới thiệu chỉ được cung cấp sau khi hoàn
        tất các điều kiện nhận lớp.
      </p>
    </section>
  );
}
