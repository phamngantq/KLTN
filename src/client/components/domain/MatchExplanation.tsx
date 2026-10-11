import type { ApplicationMatchSnapshot } from '../../../shared/schemas/classes';
import type { ClassRecommendation, MatchAdjustment } from '../../features/classes/api';
import { Badge } from '../ui/Feedback';

type Match = ClassRecommendation['match'];
type Criterion = Match['criteria'][number];

const CRITERION_LABELS: Record<Criterion['key'], string> = {
  subject: 'Môn học',
  mode: 'Hình thức dạy',
  grade: 'Khối lớp',
  area: 'Khu vực',
  schedule: 'Lịch học',
  budget: 'Học phí',
};

export const ADJUSTMENT_LABELS: Record<MatchAdjustment, string> = {
  grade: 'Dạy khối lớp này dù nằm ngoài khối lớp ưu tiên trong hồ sơ',
  area: 'Dạy tại khu vực này dù nằm ngoài khu vực ưu tiên trong hồ sơ',
  schedule: 'Trao đổi và sắp xếp lịch học phù hợp với lớp này',
};

function Criteria({ criteria }: { criteria: Match['criteria'] }) {
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {criteria.map((criterion) => (
        <li key={criterion.key} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <span className="font-medium text-fg">
            {CRITERION_LABELS[criterion.key]} ·{' '}
            {criterion.status === 'match'
              ? 'Phù hợp'
              : criterion.status === 'adjustable'
                ? 'Cần điều chỉnh'
                : 'Chưa đủ dữ liệu'}
          </span>
          <span className="text-muted">{criterion.reason}</span>
        </li>
      ))}
    </ul>
  );
}

export function MatchExplanation({ match, compact = false }: { match: Match; compact?: boolean }) {
  return (
    <section
      aria-label="Đánh giá mức độ phù hợp"
      className="rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-primary">Phù hợp {match.score}/100</p>
        <Badge
          tone={
            match.level === 'strong' ? 'success' : match.level === 'near' ? 'warning' : 'neutral'
          }
        >
          {match.level === 'strong'
            ? 'Phù hợp cao'
            : match.level === 'near'
              ? 'Có thể điều chỉnh'
              : match.level === 'uncertain'
                ? 'Cần thêm dữ liệu'
                : 'Phù hợp hạn chế'}
        </Badge>
      </div>
      {match.coverage < 100 && (
        <p className="mt-1 text-xs text-muted">
          Đã đánh giá {match.coverage}% tiêu chí; các mục còn lại chưa đủ dữ liệu.
        </p>
      )}
      {compact ? (
        <details className="mt-2 text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            Xem cách tính điểm
          </summary>
          <Criteria criteria={match.criteria} />
        </details>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            Điểm gợi ý từ hồ sơ đã lưu và yêu cầu của lớp; kiểm duyệt viên vẫn quyết định việc gán
            lớp.
          </p>
          <Criteria criteria={match.criteria} />
        </>
      )}
    </section>
  );
}

export function ApplicationMatchSummary({
  snapshot,
}: {
  snapshot: ApplicationMatchSnapshot | null;
}) {
  if (!snapshot) return null;
  const changes = snapshot.profileChanges;
  const profileWasUpdated = Boolean(
    changes?.preferredGrade || changes?.preferredArea || changes?.negotiableTime,
  );
  const acceptedScheduleWithoutProfileChange = Boolean(
    changes && snapshot.acceptedAdjustments.includes('schedule') && !changes.negotiableTime,
  );
  return (
    <section aria-label="Đánh giá khi ứng tuyển" className="rounded-md bg-info-surface p-3 text-sm">
      <p className="font-medium text-primary">Điểm khi ứng tuyển: {snapshot.score}/100</p>
      {profileWasUpdated && (
        <>
          <p className="mt-1 font-medium">Hồ sơ gia sư đã cập nhật khi gửi đơn:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {changes?.preferredGrade && <li>Thêm khối lớp ưu tiên: {changes.preferredGrade}</li>}
            {changes?.preferredArea && <li>Thêm khu vực ưu tiên: {changes.preferredArea}</li>}
            {changes?.negotiableTime && <li>Bật khả năng thương lượng lịch học</li>}
          </ul>
        </>
      )}
      {acceptedScheduleWithoutProfileChange && (
        <p className="mt-2">
          Gia sư đã xác nhận có thể sắp xếp lịch riêng cho lớp dù chưa trùng lịch rảnh đã lưu. Hồ sơ
          đã bật thương lượng lịch học từ trước nên mục này không thay đổi.
        </p>
      )}
      {!changes && snapshot.acceptedAdjustments.length > 0 && (
        <>
          <p className="mt-1 font-medium">Gia sư đã xác nhận điều chỉnh khi ứng tuyển:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {snapshot.acceptedAdjustments.map((adjustment) => (
              <li key={adjustment}>{ADJUSTMENT_LABELS[adjustment]}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
