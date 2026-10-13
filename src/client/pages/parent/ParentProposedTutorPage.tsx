import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import type { OwnParentRequest } from '../../../shared/schemas/requests';
import { ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/Feedback';
import { ProposalActions, TutorActions, useRequestPage } from './ParentRequestDetailPage';
import {
  FitScore,
  StageBadge,
  TutorAbout,
  TutorFitMeter,
  TutorSummary,
  tutorPhotoSrc,
} from './RequestStage';

/**
 * "Xem hồ sơ gia sư": full profile of the tutor assigned to one of the learner's requests
 * (`requests/:id/gia-su`) or of one proposal (`requests/:id/de-xuat/:proposalId`).
 */
export function ParentProposedTutorPage() {
  const { proposalId } = useParams();
  const { detail, fallback } = useRequestPage();
  if (fallback || !detail.data) return fallback;
  const request = detail.data;
  const back = `/parent/requests/${encodeURIComponent(request.id)}`;
  const refetch = () => void detail.refetch();

  if (proposalId) {
    const proposal = request.proposals.find((item) => item.id === proposalId);
    if (!proposal) return <Missing back={back} />;
    return (
      <ProfileLayout request={request} back={back}>
        <TutorSummary
          tutor={proposal}
          photoSrc={tutorPhotoSrc(request.id, proposal.id)}
          aside={<FitScore score={proposal.fitScore} />}
        />
        <TutorAbout tutor={proposal} />
        <ProposalActions
          request={request}
          proposal={proposal}
          onSelected={refetch}
          showProfileLink={false}
        />
      </ProfileLayout>
    );
  }

  const tutor = request.tutor;
  if (!tutor) return <Missing back={back} />;
  return (
    <ProfileLayout request={request} back={back}>
      <TutorSummary tutor={tutor} photoSrc={tutorPhotoSrc(request.id)} />
      <TutorAbout tutor={tutor} />
      <TutorFitMeter fit={tutor.fit} />
      <TutorActions
        request={request}
        canConfirm={request.stage === 'found' && tutor.learnerConfirmedAt === null}
        onConfirmed={refetch}
        showProfileLink={false}
      />
    </ProfileLayout>
  );
}

function Missing({ back }: { back: string }) {
  return (
    <EmptyState
      title="Chưa có gia sư được đề xuất"
      description="Trung tâm chưa đề xuất gia sư này cho yêu cầu của bạn."
      action={<ButtonLink to={back}>Về chi tiết yêu cầu</ButtonLink>}
    />
  );
}

function ProfileLayout({
  request,
  back,
  children,
}: {
  request: OwnParentRequest;
  back: string;
  children: ReactNode;
}) {
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
        {children}
      </article>
    </section>
  );
}
