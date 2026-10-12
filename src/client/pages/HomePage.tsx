import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  HeartHandshake,
  Phone,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useSession } from '../app/auth';
import { isReadOnlyPreview } from '../app/preview';
import { ButtonLink } from '../components/ui/Button';
import { usePublishedContent } from '../features/content/api';

const parentBenefits = [
  'Gửi yêu cầu tìm gia sư miễn phí',
  'Nêu rõ môn học, lớp, hình thức và lịch mong muốn',
  'Theo dõi trạng thái yêu cầu và lớp học',
  'Thông tin liên hệ chỉ chia sẻ với gia sư được gán',
];

const tutorBenefits = [
  'Xem danh sách lớp đã được công bố',
  'Hoàn thành điều khoản trách nhiệm trước khi ứng tuyển',
  'Chọn phương án phí nhận lớp đã công bố',
  'Theo dõi đơn ứng tuyển và lớp được gán',
];

const processSteps = [
  { icon: ClipboardList, title: 'Gửi yêu cầu', detail: 'Người học mô tả nhu cầu học tập' },
  { icon: BookOpen, title: 'Công bố lớp', detail: 'Kiểm duyệt viên xem xét yêu cầu' },
  { icon: GraduationCap, title: 'Ứng tuyển', detail: 'Gia sư chọn lớp và gửi đơn' },
  { icon: HeartHandshake, title: 'Điều phối', detail: 'Kiểm duyệt viên gán gia sư cho lớp' },
];

const reasons = [
  {
    icon: ShieldCheck,
    title: 'Hồ sơ được xem xét',
    detail: 'Hồ sơ gia sư cần được kiểm duyệt trước khi xuất hiện công khai.',
  },
  {
    icon: BookOpen,
    title: 'Nhu cầu rõ ràng',
    detail: 'Yêu cầu ghi nhận môn học, cấp lớp, hình thức và lịch học mong muốn.',
  },
  {
    icon: HeartHandshake,
    title: 'Điều phối lớp học',
    detail: 'Kiểm duyệt viên xem xét ứng tuyển và chọn gia sư cho lớp.',
  },
];

/** Contact details come from the published page so editorial changes reach the home CTAs. */
function publishedContact(bodyText: string | undefined) {
  const phone = bodyText?.match(/^Hotline:\s*(.+)$/im)?.[1]?.trim();
  const email = bodyText?.match(/^Email:\s*(.+)$/im)?.[1]?.trim();
  const dial = phone?.replace(/[^+\d]/g, '');
  return {
    phone: dial && /^\+?\d{7,15}$/.test(dial) ? phone : null,
    dial: dial && /^\+?\d{7,15}$/.test(dial) ? dial : null,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
  };
}

export function HomePage() {
  const { user } = useSession();
  const preview = isReadOnlyPreview();
  const contact = usePublishedContent('page', 'contact', 'public');
  const { phone, dial, email } = publishedContact(contact.data?.bodyText);
  const parentLink = preview
    ? '/lop-hoc'
    : user?.role === 'student'
      ? '/parent/request'
      : user
        ? '/lop-hoc'
        : '/sign-up?role=parent&next=%2Fparent%2Frequest';
  const tutorLink = user?.role === 'tutor' && !preview ? '/tutor/new-classes' : '/lop-hoc';
  const primaryLink =
    user?.role === 'tutor' && !preview
      ? '/tutor/new-classes'
      : user?.role === 'admin' && !preview
        ? '/admin'
        : parentLink;
  const primaryLabel = preview
    ? 'Xem lớp học'
    : user?.role === 'admin'
      ? 'Khu vực kiểm duyệt'
      : user?.role === 'tutor'
        ? 'Gia sư tìm lớp'
        : user?.role === 'student'
          ? 'Gửi yêu cầu'
          : 'Đăng ký ngay';

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-20 text-on-primary md:py-32">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-10 [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:60px_60px]"
        />
        <div className="relative mx-auto max-w-[var(--container-max)] text-center">
          <div className="mb-6 inline-flex flex-wrap items-center justify-center gap-3">
            <GraduationCap aria-hidden="true" className="size-12 text-accent" />
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">Gia Sư Đỗ Hằng</h1>
          </div>
          <p className="mx-auto max-w-4xl text-2xl md:text-3xl">
            Tìm gia sư uy tín - Chất lượng cao cho con bạn
          </p>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-on-primary/90 md:text-xl">
            Người học gửi yêu cầu học tập, gia sư ứng tuyển lớp đã công bố và kiểm duyệt viên điều
            phối lớp học.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <ButtonLink to={primaryLink} variant="accent" className="px-8 text-lg">
              {primaryLabel}
            </ButtonLink>
            {dial && phone ? (
              <a
                href={`tel:${dial}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/30 bg-primary px-8 text-lg font-medium text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Phone aria-hidden="true" className="size-5" />
                Gọi ngay: {phone}
              </a>
            ) : (
              <ButtonLink
                to="/lien-he"
                className="border border-white/30 bg-primary px-8 text-lg hover:bg-primary-hover"
              >
                Liên hệ tư vấn
              </ButtonLink>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Quy trình kết nối gia sư" className="bg-bg px-4 py-12">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 md:grid-cols-4">
          {processSteps.map(({ icon: Icon, title, detail }, index) => (
            <div key={title} className="text-center">
              <span
                aria-hidden="true"
                className={`mx-auto mb-3 flex size-20 items-center justify-center rounded-2xl shadow-card ${index % 2 === 0 ? 'bg-gradient-to-br from-primary to-primary-gradient-end text-on-primary' : 'bg-accent text-on-accent'}`}
              >
                <Icon className="size-10" />
              </span>
              <h2 className="text-lg font-bold text-primary md:text-xl">{title}</h2>
              <p className="mt-1 text-sm text-muted">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="roles-heading" className="bg-surface px-4 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 id="roles-heading" className="text-3xl font-bold text-primary md:text-4xl">
              Bạn Đang Tìm Kiếm Gì?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
              Chọn vai trò phù hợp để bắt đầu hành trình của bạn
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            <article className="flex flex-col rounded-xl border-2 border-primary/20 bg-bg p-6 shadow-card transition-shadow hover:border-accent hover:shadow-lg motion-reduce:transition-none">
              <span
                aria-hidden="true"
                className="mx-auto flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-gradient-end text-on-primary"
              >
                <Users className="size-10" />
              </span>
              <h3 className="mt-4 text-center text-2xl font-semibold text-primary md:text-3xl">
                Phụ Huynh / Học Sinh
              </h3>
              <p className="mt-2 text-center text-muted">
                Tìm gia sư phù hợp với nhu cầu của gia đình
              </p>
              <ul className="my-6 space-y-3">
                {parentBenefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3 text-fg">
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-primary"
                    />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <ButtonLink to={parentLink} className="mt-auto w-full text-lg">
                {preview || (user && user.role !== 'student') ? 'Xem lớp học' : 'Đăng ký tư vấn'}
              </ButtonLink>
              {user?.role === 'student' && !preview && (
                <ButtonLink to="/parent" variant="ghost" className="mt-2 w-full">
                  Theo dõi yêu cầu của tôi
                </ButtonLink>
              )}
            </article>

            <article className="flex flex-col rounded-xl border-2 border-primary/20 bg-bg p-6 shadow-card transition-shadow hover:border-accent hover:shadow-lg motion-reduce:transition-none">
              <span
                aria-hidden="true"
                className="mx-auto flex size-20 items-center justify-center rounded-full bg-accent text-on-accent"
              >
                <GraduationCap className="size-10" />
              </span>
              <h3 className="mt-4 text-center text-2xl font-semibold text-primary md:text-3xl">
                Gia Sư
              </h3>
              <p className="mt-2 text-center text-muted">Tìm lớp học và theo dõi đơn nhận lớp</p>
              <ul className="my-6 space-y-3">
                {tutorBenefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3 text-fg">
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-primary"
                    />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <ButtonLink to={tutorLink} variant="accent" className="mt-auto w-full text-lg">
                Gia sư tìm lớp
              </ButtonLink>
              {!user && !preview && (
                <ButtonLink to="/sign-up?role=tutor" variant="ghost" className="mt-2 w-full">
                  Tạo hồ sơ gia sư
                </ButtonLink>
              )}
            </article>
          </div>
        </div>
      </section>

      <section aria-labelledby="reasons-heading" className="bg-bg px-4 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 id="reasons-heading" className="text-3xl font-bold text-primary md:text-4xl">
              Tại Sao Chọn Chúng Tôi?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
              Quy trình kết nối có bước kiểm duyệt và theo dõi rõ ràng
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {reasons.map(({ icon: Icon, title, detail }) => (
              <article key={title} className="text-center">
                <span
                  aria-hidden="true"
                  className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-gradient-end text-on-primary shadow-card"
                >
                  <Icon className="size-10" />
                </span>
                <h3 className="text-xl font-semibold text-primary">{title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-20 text-on-primary">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl">Sẵn Sàng Bắt Đầu?</h2>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-on-primary/90">
            Gửi yêu cầu tìm gia sư hoặc xem những lớp học đang nhận ứng tuyển.
          </p>
          {(phone || email) && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              {dial && phone && (
                <a
                  href={`tel:${dial}`}
                  className="inline-flex min-h-11 items-center gap-2 text-xl font-bold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Phone aria-hidden="true" className="size-5" />
                  {phone}
                </a>
              )}
              {dial && phone && email && (
                <span className="hidden text-on-primary/50 sm:inline">|</span>
              )}
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="min-w-0 max-w-full break-all text-lg text-on-primary/90 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {email}
                </a>
              )}
            </div>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <ButtonLink to={primaryLink} variant="accent" className="px-8 text-lg">
              {primaryLabel}
            </ButtonLink>
            <ButtonLink
              to="/lien-he"
              className="border border-white/30 bg-primary px-8 text-lg hover:bg-primary-hover"
            >
              Liên hệ tư vấn
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
