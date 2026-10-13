import type { ReactNode } from 'react';
import {
  BookOpen,
  BriefcaseBusiness,
  CircleCheck,
  CircleHelp,
  GraduationCap,
  School,
} from 'lucide-react';
import type {
  LearnerRequestStage,
  ProposedTutor,
  ProposedTutorFit,
  RequestStage,
  RequestStatus,
} from '../../../shared/schemas/requests';
import { TUTOR_TYPE_LABELS } from '../../../shared/schemas/pricing';
import { Badge } from '../../components/ui/Feedback';
import { REQUEST_STATUS_LABELS } from '../../features/parent-requests/format';

export const STAGE_LABELS: Record<LearnerRequestStage, string> = {
  searching: 'Đang tìm gia sư',
  found: 'Đã tìm được gia sư',
  confirmed: 'Đã xác nhận',
};
const STAGE_TONES: Record<LearnerRequestStage, 'warning' | 'info' | 'success'> = {
  searching: 'warning',
  found: 'info',
  confirmed: 'success',
};

/** The same label in list rows and detail pages, derived from the learner stage. */
export function StageBadge({ stage, status }: { stage: RequestStage; status: RequestStatus }) {
  if (stage === 'other') return <Badge tone="neutral">{REQUEST_STATUS_LABELS[status]}</Badge>;
  return <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Badge>;
}

const FIT_LEVELS: Record<ProposedTutorFit['level'], { label: string; tone: string }> = {
  strong: { label: 'Rất phù hợp', tone: 'text-success' },
  near: { label: 'Phù hợp', tone: 'text-primary' },
  low: { label: 'Phù hợp một phần', tone: 'text-warning' },
  uncertain: { label: 'Chưa đủ dữ liệu để đánh giá đầy đủ', tone: 'text-muted' },
};

const CRITERIA: Record<
  string,
  { label: string; match: string; adjustable: string; unknown: string }
> = {
  subject: {
    label: 'Môn học',
    match: 'Gia sư dạy đúng môn bạn cần.',
    adjustable: 'Gia sư có thể dạy môn này.',
    unknown: 'Chưa đủ thông tin môn học.',
  },
  mode: {
    label: 'Hình thức học',
    match: 'Gia sư nhận dạy theo hình thức bạn chọn.',
    adjustable: 'Gia sư có thể sắp xếp hình thức này.',
    unknown: 'Chưa đủ thông tin hình thức học.',
  },
  grade: {
    label: 'Lớp học',
    match: 'Lớp của học sinh thuộc nhóm lớp gia sư ưu tiên.',
    adjustable: 'Lớp ngoài nhóm ưu tiên; gia sư đã nhận dạy riêng lớp này.',
    unknown: 'Gia sư chưa khai báo nhóm lớp ưu tiên.',
  },
  area: {
    label: 'Khu vực',
    match: 'Khu vực học phù hợp với địa bàn gia sư nhận dạy.',
    adjustable: 'Khu vực ngoài địa bàn ưu tiên; gia sư đã nhận di chuyển.',
    unknown: 'Chưa đủ thông tin khu vực để đối chiếu.',
  },
  schedule: {
    label: 'Lịch học',
    match: 'Lịch rảnh của gia sư trùng với khung giờ bạn mong muốn.',
    adjustable: 'Cần trao đổi thêm để thống nhất lịch học.',
    unknown: 'Chưa đủ lịch rảnh của gia sư để đối chiếu.',
  },
};

/** Percentage meter plus one plain-language line per criterion. */
export function TutorFitMeter({ fit }: { fit: ProposedTutorFit }) {
  const level = FIT_LEVELS[fit.level];
  const percent = Math.max(0, Math.min(100, Math.round(fit.score)));
  return (
    <section aria-labelledby="tutor-fit" className="flex flex-col gap-3 rounded-xl bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h4 id="tutor-fit" className="text-sm font-semibold text-primary">
          Độ phù hợp với yêu cầu
        </h4>
        <p className={`text-sm font-semibold ${level.tone}`}>
          <span className="text-2xl font-bold">{percent}%</span> · {level.label}
        </p>
      </div>
      <div
        role="meter"
        aria-label="Độ phù hợp"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-3 overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-success"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {fit.criteria.map((item) => {
          const copy = CRITERIA[item.key];
          if (!copy) return null;
          const Icon = item.status === 'match' ? CircleCheck : CircleHelp;
          return (
            <li key={item.key} className="flex items-start gap-2">
              <Icon
                aria-hidden="true"
                className={`mt-0.5 size-4 shrink-0 ${item.status === 'match' ? 'text-success' : 'text-warning'}`}
              />
              <span>
                <strong className="font-medium text-primary">{copy.label}: </strong>
                {copy[item.status]}
              </span>
            </li>
          );
        })}
      </ul>
      {fit.coverage < 100 && (
        <p className="text-xs text-muted">
          Điểm dựa trên thông tin hai bên đã khai báo; mục chưa đủ dữ liệu được tính một phần.
        </p>
      )}
    </section>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return ((words.at(-2)?.[0] ?? '') + (words.at(-1)?.[0] ?? '')).toUpperCase() || 'GS';
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className="mt-0.5 text-muted">
        {icon}
      </span>
      <div>
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}

/** Avatar, name and teaching facts of the proposed tutor. */
export function TutorSummary({ tutor, requestId }: { tutor: ProposedTutor; requestId: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {tutor.hasPhoto ? (
          <img
            src={`/api/v1/parent/requests/${encodeURIComponent(requestId)}/tutor-photo`}
            alt={`Ảnh đại diện của ${tutor.displayName}`}
            className="size-16 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-gradient-end text-xl font-bold text-on-primary"
          >
            {initials(tutor.displayName)}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-xl font-semibold text-primary">{tutor.displayName}</p>
          <p className="text-sm text-muted">
            {tutor.tutorType ? TUTOR_TYPE_LABELS[tutor.tutorType] : 'Gia sư của trung tâm'}
          </p>
        </div>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Fact icon={<GraduationCap className="size-4" />} label="Trình độ">
          {tutor.tutorType ? TUTOR_TYPE_LABELS[tutor.tutorType] : 'Chưa cập nhật'}
        </Fact>
        <Fact icon={<School className="size-4" />} label="Trường học">
          {tutor.school ?? 'Chưa cập nhật'}
        </Fact>
        <Fact icon={<BookOpen className="size-4" />} label="Chuyên môn">
          {tutor.specialization ?? (tutor.subjects.join(', ') || 'Chưa cập nhật')}
        </Fact>
        <Fact icon={<BriefcaseBusiness className="size-4" />} label="Kinh nghiệm giảng dạy">
          {tutor.experienceYears === null ? 'Chưa cập nhật' : `${tutor.experienceYears} năm`}
        </Fact>
      </dl>
      {tutor.experienceSummary && <p className="text-sm text-muted">{tutor.experienceSummary}</p>}
    </div>
  );
}
