import { useSession } from '../app/auth';
import { ButtonLink } from '../components/ui/Button';

export function HomePage() {
  const { user } = useSession();
  return (
    <section className="flex flex-col items-start gap-4 py-8">
      <h1 className="text-[length:var(--text-display)] leading-tight font-bold">
        Tìm gia sư phù hợp và đặt lịch học dễ dàng
      </h1>
      <p className="max-w-prose text-muted">
        Kết nối học viên với gia sư theo môn học, hình thức dạy và lịch trống thực tế.
      </p>
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
