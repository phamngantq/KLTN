import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../app/auth';
import { isReadOnlyPreview } from '../app/preview';
import { Button, ButtonLink } from '../components/ui/Button';
import { SelectField } from '../components/ui/Field';
import { useSubjects } from '../features/tutor-profile/api';

export function HomePage() {
  const { user } = useSession();
  const preview = isReadOnlyPreview();
  const subjects = useSubjects();
  const navigate = useNavigate();

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = String(new FormData(event.currentTarget).get('subject') ?? '');
    navigate(subject ? `/tutors?subject=${encodeURIComponent(subject)}` : '/tutors');
  }

  return (
    <>
      <section className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-16 text-on-primary md:py-24">
        <div className="mx-auto max-w-[var(--container-max)] text-center">
          <p className="mb-4 text-sm font-semibold tracking-wide text-accent">
            NỀN TẢNG KẾT NỐI GIA SƯ
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl leading-tight font-bold md:text-5xl">
            Tìm gia sư phù hợp với nhu cầu học tập
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-on-primary/90">
            {preview
              ? 'Khám phá giao diện với hồ sơ minh họa. Bản xem trước chưa nhận đăng ký, yêu cầu tìm gia sư hoặc đặt lịch.'
              : 'Khám phá hồ sơ gia sư hiện có. Luồng gửi yêu cầu tìm gia sư và nhận lớp theo bản thiết kế mới đang được xây dựng.'}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/tutors" variant="accent">
              {preview ? 'Xem hồ sơ minh họa' : 'Xem gia sư hiện có'}
            </ButtonLink>
            <ButtonLink to="/gioi-thieu" variant="secondary">
              Tìm hiểu nền tảng
            </ButtonLink>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="roles-heading"
        className="mx-auto max-w-[var(--container-max)] px-4 py-12 md:py-16"
      >
        <div className="mb-8 text-center">
          <h2 id="roles-heading" className="text-3xl font-bold text-primary">
            Dành cho ai?
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-muted">
            Hai hành trình chính từ bản thiết kế sản phẩm mới.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-lg border border-border bg-bg p-6 shadow-card">
            <span
              aria-hidden="true"
              className="inline-flex size-12 items-center justify-center rounded-lg bg-info-surface text-2xl text-primary"
            >
              ⌂
            </span>
            <h3 className="mt-4 text-2xl font-semibold text-primary">Phụ huynh</h3>
            <p className="mt-2 text-muted">
              Gửi nhu cầu học tập, theo dõi yêu cầu và kết nối với gia sư phù hợp.
            </p>
            <p className="mt-4 rounded-md bg-info-surface p-3 text-sm text-primary">
              Chức năng gửi yêu cầu đang được triển khai.
            </p>
            {user?.role === 'student' && (
              <ButtonLink to="/parent" variant="secondary" className="mt-4">
                Xem khu vực phụ huynh
              </ButtonLink>
            )}
          </article>
          <article className="rounded-lg border border-border bg-bg p-6 shadow-card">
            <span
              aria-hidden="true"
              className="inline-flex size-12 items-center justify-center rounded-lg bg-info-surface text-2xl text-primary"
            >
              ✦
            </span>
            <h3 className="mt-4 text-2xl font-semibold text-primary">Gia sư</h3>
            <p className="mt-2 text-muted">
              Tạo hồ sơ, xem lớp phù hợp và đăng ký nhận lớp khi luồng mới hoàn thành.
            </p>
            <p className="mt-4 rounded-md bg-info-surface p-3 text-sm text-primary">
              Hồ sơ gia sư hiện dùng được; đăng ký lớp chưa mở.
            </p>
            {!user && !preview && (
              <ButtonLink to="/sign-up?role=tutor" variant="secondary" className="mt-4">
                Tạo hồ sơ gia sư
              </ButtonLink>
            )}
            {user?.role === 'tutor' && !preview && (
              <ButtonLink to="/tutor/profile" variant="secondary" className="mt-4">
                Xem hồ sơ của tôi
              </ButtonLink>
            )}
          </article>
        </div>
      </section>

      <section aria-labelledby="available-heading" className="bg-surface px-4 py-12 md:py-16">
        <div className="mx-auto grid max-w-[var(--container-max)] gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <h2 id="available-heading" className="text-3xl font-bold text-primary">
              Tìm gia sư hiện có
            </h2>
            <p className="mt-3 max-w-prose text-muted">
              {preview
                ? 'Hồ sơ gia sư ở đây là dữ liệu minh họa để xem giao diện, không phải gia sư đang nhận lớp.'
                : 'Bạn có thể xem hồ sơ gia sư đã được duyệt theo môn học. Đây là chức năng đang hoạt động trong hệ thống hiện tại.'}
            </p>
            {!user && !preview && (
              <p className="mt-5 text-sm text-muted">
                <ButtonLink to="/sign-up" variant="ghost">
                  Tạo tài khoản
                </ButtonLink>{' '}
                cho luồng đặt lịch hiện tại.
              </p>
            )}
          </div>
          <div>
            <form
              role="search"
              aria-label="Tìm gia sư theo môn"
              onSubmit={onSearch}
              className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-5 shadow-card sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <SelectField
                  label="Môn học"
                  name="subject"
                  defaultValue=""
                  disabled={subjects.isPending}
                >
                  <option value="">Tất cả môn</option>
                  {subjects.data?.map((subject) => (
                    <option key={subject.id} value={subject.slug}>
                      {subject.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <Button type="submit">Tìm gia sư</Button>
            </form>
            {subjects.isError && (
              <p className="mt-2 text-sm text-muted">
                Không tải được danh sách môn; bạn vẫn có thể xem tất cả gia sư.
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
