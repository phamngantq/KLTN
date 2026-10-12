import { useParams } from 'react-router';
import { isReadOnlyPreview } from '../../app/preview';
import { teachingModes, TutorAvatar } from '../../components/domain/TutorCard';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useTutor } from '../../features/discovery/api';
import { isApiError } from '../../lib/api-client';
import { formatVnd } from '../../lib/format';

export function TutorDetailPage() {
  const preview = isReadOnlyPreview();
  const { slug = '' } = useParams();
  const tutor = useTutor(slug);

  if (tutor.isPending) return <PageLoading />;
  if (tutor.isError) {
    if (isApiError(tutor.error, 'TUTOR_NOT_FOUND')) {
      return (
        <EmptyState
          title="Không tìm thấy gia sư"
          description="Hồ sơ không tồn tại hoặc chưa được công khai."
          action={<ButtonLink to="/tutors">Xem danh sách gia sư</ButtonLink>}
        />
      );
    }
    return (
      <Alert
        tone="danger"
        title="Không tải được hồ sơ"
        action={
          <Button variant="secondary" onClick={() => void tutor.refetch()}>
            Thử lại
          </Button>
        }
      >
        {tutor.error.message}
      </Alert>
    );
  }

  const data = tutor.data;
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <TutorAvatar name={data.displayName} size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className="text-[length:var(--text-heading)] font-bold">{data.displayName}</h1>
          <p className="text-muted">{teachingModes(data)}</p>
          <p className="text-lg font-semibold">
            {preview ? (
              'Hồ sơ minh họa · Học phí chưa công bố'
            ) : (
              <>
                {formatVnd(data.hourlyRateMinor)}
                <span className="text-sm font-normal text-muted"> /giờ</span>
              </>
            )}
          </p>
        </div>
      </header>
      <section aria-labelledby="subjects-heading" className="flex flex-col gap-2">
        <h2 id="subjects-heading" className="font-semibold">
          Môn dạy
        </h2>
        <ul className="flex flex-wrap gap-2">
          {data.subjects.map((subject) => (
            <li key={subject.id}>
              <Badge tone="info">{subject.name}</Badge>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="bio-heading" className="flex flex-col gap-2">
        <h2 id="bio-heading" className="font-semibold">
          Giới thiệu
        </h2>
        <p className="max-w-prose whitespace-pre-line text-fg">{data.bio}</p>
      </section>
      <Alert tone="info" title="Tìm gia sư theo yêu cầu">
        Người học gửi môn học, lớp và lịch mong muốn. Kiểm duyệt viên sẽ điều phối gia sư phù hợp.
      </Alert>
      {!preview && <ButtonLink to="/parent/request">Gửi yêu cầu tìm gia sư</ButtonLink>}
    </article>
  );
}
