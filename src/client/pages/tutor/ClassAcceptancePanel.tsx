import { Building2, Landmark } from 'lucide-react';
import { Badge } from '../../components/ui/Feedback';
import { formatVnd } from '../../lib/format';

export const CENTRE_ADDRESS = 'Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội';
export const CENTRE_PHONE = '0394 618 480';

/**
 * "Hoàn tất nhận lớp" for a first-time tutor: sign the contract and pay at the centre. The centre
 * records both; only then do learner contact and the letter appear in "Lớp đã hoàn tất".
 */
export function ClassAcceptancePanel({
  feeMinor,
  classCode,
}: {
  feeMinor: number | null;
  classCode: string;
}) {
  const fee = feeMinor === null ? 'theo thông báo của trung tâm' : formatVnd(feeMinor);
  return (
    <section
      aria-label="Hoàn tất nhận lớp"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-primary">Hoàn tất nhận lớp</h3>
        <Badge tone="info">Nhận lớp lần đầu</Badge>
      </div>
      <p>
        Phí nhận lớp: <strong className="text-primary">{fee}</strong>
      </p>
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
              Nội dung chuyển khoản: <strong>PHI NHAN LOP {classCode}</strong>.
            </li>
          </ul>
        </div>
      </div>
      <p>
        Trung tâm chỉ xác nhận hoàn tất nhận lớp sau khi bạn đã ký hợp đồng và trung tâm ghi nhận đã
        nhận đủ phí.
      </p>
      <p className="text-muted">
        Thông tin liên hệ chi tiết của người học và thư giới thiệu chỉ được cung cấp sau khi hoàn
        tất các điều kiện nhận lớp.
      </p>
    </section>
  );
}
