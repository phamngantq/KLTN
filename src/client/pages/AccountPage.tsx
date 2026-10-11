import { useSession } from '../app/auth';
import { PageHeader } from '../components/ui/Feedback';
import { ROLE_LABELS } from '../lib/format';

/** Signed-in account summary. Rendered behind RequireRole, so `user` is present. */
export function AccountPage() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <section>
      <PageHeader title="Tài khoản" />
      <dl className="grid max-w-lg grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border border-border p-4">
        <dt className="text-muted">Họ tên</dt>
        <dd>{user.displayName}</dd>
        <dt className="text-muted">Email</dt>
        <dd className="break-all">{user.email}</dd>
        <dt className="text-muted">Vai trò</dt>
        <dd>{ROLE_LABELS[user.role]}</dd>
      </dl>
    </section>
  );
}
