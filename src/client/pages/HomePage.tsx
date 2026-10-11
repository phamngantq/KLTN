import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../app/auth';
import { Button, ButtonLink } from '../components/ui/Button';
import { SelectField } from '../components/ui/Field';
import { useSubjects } from '../features/tutor-profile/api';

export function HomePage() {
  const { user } = useSession();
  const subjects = useSubjects();
  const navigate = useNavigate();

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = String(new FormData(event.currentTarget).get('subject') ?? '');
    navigate(subject ? `/tutors?subject=${encodeURIComponent(subject)}` : '/tutors');
  }

  return (
    <section className="flex flex-col items-start gap-6 py-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-[length:var(--text-display)] leading-tight font-bold">
          Tìm gia sư phù hợp và đặt lịch học dễ dàng
        </h1>
        <p className="max-w-prose text-muted">
          Kết nối học viên với gia sư theo môn học, hình thức dạy và lịch trống thực tế.
        </p>
      </div>
      <form
        role="search"
        aria-label="Tìm gia sư theo môn"
        onSubmit={onSearch}
        className="flex w-full max-w-xl flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <SelectField label="Môn học" name="subject" defaultValue="" disabled={subjects.isPending}>
            <option value="">Tất cả môn</option>
            {subjects.data?.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <Button type="submit">Tìm gia sư</Button>
      </form>
      {subjects.isError && (
        <p className="text-sm text-muted">
          Không tải được danh sách môn — bạn vẫn có thể xem tất cả gia sư.
        </p>
      )}
      {!user && (
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/sign-up">Tạo tài khoản</ButtonLink>
          <ButtonLink to="/sign-up?role=tutor" variant="secondary">
            Đăng ký làm gia sư
          </ButtonLink>
        </div>
      )}
    </section>
  );
}
