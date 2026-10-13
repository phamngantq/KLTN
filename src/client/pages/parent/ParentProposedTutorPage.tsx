import { ArrowLeft, Laptop, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/Feedback';
import { TutorActions, useRequestPage } from './ParentRequestDetailPage';
import { StageBadge, TutorFitMeter, TutorSummary } from './RequestStage';

/** "Xem hồ sơ gia sư": full profile of the tutor proposed for one of the learner's requests. */
export function ParentProposedTutorPage() {
  const { detail, fallback } = useRequestPage();
  if (fallback || !detail.data) return fallback;
  const request = detail.data;
  const tutor = request.tutor;
  const back = `/parent/requests/${encodeURIComponent(request.id)}`;
  if (!tutor) {
    return (
      <EmptyState
        title="Chưa có gia sư được đề xuất"
        description="Trung tâm chưa đề xuất gia sư cho yêu cầu này."
        action={<ButtonLink to={back}>Về chi tiết yêu cầu</ButtonLink>}
      />
    );
  }
  return (
    <section className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <Link
        to={back}
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Về yêu cầu {request.code}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold text-primary">Hồ sơ gia sư</h1>
        <StageBadge stage={request.stage} status={request.status} />
      </div>
      <article className="flex flex-col gap-6 rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6">
        <TutorSummary tutor={tutor} requestId={request.id} />
        <section aria-labelledby="tutor-about" className="flex flex-col gap-2">
          <h2 id="tutor-about" className="text-lg font-semibold text-primary">
            Giới thiệu
          </h2>
          <p className="whitespace-pre-line text-sm">
            {tutor.bio || 'Gia sư chưa viết giới thiệu.'}
          </p>
        </section>
        <section aria-labelledby="tutor-teaching" className="flex flex-col gap-3">
          <h2 id="tutor-teaching" className="text-lg font-semibold text-primary">
            Môn và hình thức dạy
          </h2>
          <ul className="flex flex-wrap gap-2">
            {tutor.subjects.map((subject) => (
              <li
                key={subject}
                className="rounded-full bg-info-surface px-3 py-1 text-sm font-medium text-primary"
              >
                {subject}
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap gap-4 text-sm text-muted">
            {tutor.teachesOnline && (
              <span className="inline-flex items-center gap-1">
                <Laptop aria-hidden="true" className="size-4" /> Dạy online
              </span>
            )}
            {tutor.teachesOffline && (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="size-4" /> Dạy tại nhà
              </span>
            )}
          </p>
        </section>
        <TutorFitMeter fit={tutor.fit} />
        <TutorActions
          request={request}
          canConfirm={request.stage === 'found' && tutor.learnerConfirmedAt === null}
          onConfirmed={() => void detail.refetch()}
          showProfileLink={false}
        />
      </article>
    </section>
  );
}
