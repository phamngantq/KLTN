import { ButtonLink } from '../../components/ui/Button';
import { PublishedContentCollectionPage } from './PublishedContentPage';

const STEPS = [
  {
    title: 'Gửi yêu cầu',
    description: 'Phụ huynh nhập môn học, khối lớp, hình thức và lịch mong muốn.',
  },
  {
    title: 'Kiểm duyệt lớp',
    description: 'Kiểm duyệt viên xem yêu cầu trước khi công bố thông tin lớp có thể chia sẻ.',
  },
  {
    title: 'Gia sư ứng tuyển',
    description: 'Gia sư xem lớp được công bố và chọn phương án phí hiện hành khi ứng tuyển.',
  },
  {
    title: 'Điều phối',
    description: 'Kiểm duyệt viên gán gia sư cho lớp và lớp bắt đầu hoạt động.',
  },
] as const;

export function PublicServicesPage() {
  return (
    <>
      <PublishedContentCollectionPage
        kind="service"
        title="Dịch Vụ Của Chúng Tôi"
        description="Tìm gia sư và theo dõi việc điều phối lớp học."
      />
      <section className="bg-surface px-4 py-12" aria-labelledby="service-process-heading">
        <div className="mx-auto max-w-[var(--container-max)]">
          <h2 id="service-process-heading" className="text-2xl font-semibold text-primary">
            Quy Trình Làm Việc
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="rounded-xl border border-border bg-bg p-5 shadow-card"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-primary font-bold text-on-primary">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.description}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/parent/request">Gửi yêu cầu tìm gia sư</ButtonLink>
            <ButtonLink to="/lop-hoc" variant="secondary">
              Xem lớp đang tìm gia sư
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
