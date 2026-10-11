import { Link } from 'react-router';
import type { PublicTutor } from '../../../shared/schemas/discovery';
import { isReadOnlyPreview } from '../../app/preview';
import { formatVnd, initials } from '../../lib/format';
import { Badge } from '../ui/Feedback';

export function teachingModes(
  tutor: Pick<PublicTutor, 'teachesOnline' | 'teachesOffline'>,
): string {
  return [tutor.teachesOnline && 'Trực tuyến', tutor.teachesOffline && 'Trực tiếp']
    .filter(Boolean)
    .join(' · ');
}

export function TutorAvatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const dimension = size === 'lg' ? 'size-16 text-xl' : 'size-12 text-base';
  return (
    <span
      aria-hidden="true"
      className={`${dimension} inline-flex shrink-0 items-center justify-center rounded-full bg-info-surface font-semibold text-primary`}
    >
      {initials(name)}
    </span>
  );
}

/** Shows only real profile data — no fabricated ratings, reviews or "online now" signals. */
export function TutorCard({ tutor }: { tutor: PublicTutor }) {
  const preview = isReadOnlyPreview();
  return (
    <article className="flex h-full flex-col gap-3 rounded-lg border border-border bg-bg p-4 shadow-card">
      <div className="flex items-center gap-3">
        <TutorAvatar name={tutor.displayName} />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">
            <Link
              to={`/tutors/${tutor.slug}`}
              className="text-fg after:absolute after:inset-0 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus"
            >
              {tutor.displayName}
            </Link>
          </h2>
          <p className="text-sm text-muted">{teachingModes(tutor)}</p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-1" aria-label="Môn dạy">
        {tutor.subjects.map((subject) => (
          <li key={subject.id}>
            <Badge tone="info">{subject.name}</Badge>
          </li>
        ))}
      </ul>
      <p className="line-clamp-3 text-sm text-muted">{tutor.bio}</p>
      <p className="mt-auto font-semibold text-fg">
        {preview ? (
          'Hồ sơ minh họa · Học phí chưa công bố'
        ) : (
          <>
            {formatVnd(tutor.hourlyRateMinor)}
            <span className="text-sm font-normal text-muted"> /giờ</span>
          </>
        )}
      </p>
    </article>
  );
}
