import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { UserRole } from '../../../shared/schemas/auth';
import type { AdminUser } from '../../../shared/schemas/admin-users';
import type { Page } from '../../../shared/schemas/discovery';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { SelectField, TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api, fieldErrors, toQuery } from '../../lib/api-client';

const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Phụ huynh',
  tutor: 'Gia sư',
  admin: 'Kiểm duyệt viên',
};

type UserStatus = AdminUser['status'];

function searchParams(role: UserRole | '', status: UserStatus | '', search: string, page: number) {
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  if (page > 1) params.set('page', String(page));
  return params;
}

export function AdminUsersPage() {
  const [params, setParams] = useSearchParams();
  const rawRole = params.get('role');
  const role: UserRole | '' =
    rawRole === 'student' || rawRole === 'tutor' || rawRole === 'admin' ? rawRole : '';
  const rawStatus = params.get('status');
  const status: UserStatus | '' =
    rawStatus === 'active' || rawStatus === 'suspended' ? rawStatus : '';
  const search = params.get('search') ?? '';
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const [searchText, setSearchText] = useState(search);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ['admin-users', role, status, search, page],
    queryFn: ({ signal }) =>
      api.get<Page<AdminUser>>(
        `/admin/users${toQuery({ role: role || undefined, status: status || undefined, search: search || undefined, page })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
  const change = useMutation({
    mutationFn: ({ user, reason }: { user: AdminUser; reason: string }) =>
      api.post<AdminUser>(
        `/admin/users/${encodeURIComponent(user.id)}/${user.status === 'active' ? 'suspend' : 'reactivate'}`,
        {
          updatedAt: user.updatedAt,
          reason: reason.trim(),
        },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParams(searchParams(role, status, searchText.trim(), 1));
  }

  function confirm() {
    if (!selected) return;
    if (!reason.trim()) {
      setLocalError('Cần nêu lý do thay đổi trạng thái.');
      return;
    }
    change.mutate(
      { user: selected, reason },
      {
        onSuccess: (updated) => {
          setSelected(null);
          setNotice(
            `Đã ${updated.status === 'suspended' ? 'khóa' : 'mở khóa'} tài khoản ${updated.displayName}.`,
          );
        },
      },
    );
  }

  const errors = fieldErrors(change.error);

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Quản lý người dùng"
        description="Xem tài khoản thật và khóa hoặc mở khóa phụ huynh, gia sư khi cần. Tài khoản kiểm duyệt viên được bảo vệ."
      />
      {isReadOnlyPreview() && (
        <Alert tone="info">
          Bản xem trước chỉ cho phép xem tài khoản; thao tác khóa và mở khóa cần môi trường có quyền
          ghi.
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr] md:items-end">
        <SelectField
          label="Vai trò"
          value={role}
          onChange={(event) =>
            setParams(searchParams(event.target.value as UserRole | '', status, search, 1))
          }
        >
          <option value="">Tất cả vai trò</option>
          <option value="student">Phụ huynh</option>
          <option value="tutor">Gia sư</option>
          <option value="admin">Kiểm duyệt viên</option>
        </SelectField>
        <SelectField
          label="Trạng thái"
          value={status}
          onChange={(event) =>
            setParams(searchParams(role, event.target.value as UserStatus | '', search, 1))
          }
        >
          <option value="">Tất cả trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="suspended">Đã khóa</option>
        </SelectField>
        <form className="flex items-end gap-2" onSubmit={submitSearch}>
          <div className="min-w-0 flex-1">
            <TextField
              label="Tìm tên hoặc email"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              maxLength={100}
            />
          </div>
          <Button type="submit">Tìm</Button>
        </form>
      </div>
      {users.isPending ? (
        <PageLoading label="Đang tải tài khoản…" />
      ) : users.isError ? (
        <Alert
          tone="danger"
          title="Không tải được tài khoản"
          action={
            <Button variant="secondary" onClick={() => void users.refetch()}>
              Thử lại
            </Button>
          }
        >
          {users.error.message}
        </Alert>
      ) : users.data.items.length === 0 ? (
        <EmptyState
          title="Không có tài khoản phù hợp"
          description="Thử thay đổi từ khóa hoặc bộ lọc."
        />
      ) : (
        <>
          <p className="text-sm text-muted" role="status">
            {users.data.total} tài khoản · Trang {users.data.page}
          </p>
          <ul className="grid gap-4">
            {users.data.items.map((user) => (
              <li key={user.id} className="rounded-lg border border-border bg-bg p-4 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-primary">{user.displayName}</h2>
                  <Badge tone={user.status === 'active' ? 'success' : 'warning'}>
                    {user.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                  </Badge>
                </div>
                <p className="mt-2 break-all text-sm">{user.email}</p>
                <p className="mt-1 text-sm text-muted">{ROLE_LABELS[user.role]}</p>
                {user.role !== 'admin' && (
                  <Button
                    className="mt-3"
                    variant={user.status === 'active' ? 'danger' : 'secondary'}
                    disabled={isReadOnlyPreview()}
                    onClick={() => {
                      change.reset();
                      setNotice('');
                      setLocalError('');
                      setReason('');
                      setSelected(user);
                    }}
                  >
                    {user.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <nav aria-label="Trang tài khoản" className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setParams(searchParams(role, status, search, page - 1))}
            >
              Trang trước
            </Button>
            <span className="text-sm text-muted">
              Trang {page} / {Math.max(1, Math.ceil(users.data.total / users.data.pageSize))}
            </span>
            <Button
              variant="secondary"
              disabled={page * users.data.pageSize >= users.data.total}
              onClick={() => setParams(searchParams(role, status, search, page + 1))}
            >
              Trang sau
            </Button>
          </nav>
        </>
      )}
      <ConfirmDialog
        open={selected !== null}
        title={selected?.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
        description={
          selected?.status === 'active'
            ? `Khóa ${selected.displayName} sẽ kết thúc các phiên đăng nhập của tài khoản này.`
            : `Mở khóa ${selected?.displayName ?? ''} sẽ cho phép đăng nhập lại.`
        }
        confirmLabel={selected?.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
        tone={selected?.status === 'active' ? 'danger' : 'primary'}
        loading={change.isPending}
        onCancel={() => setSelected(null)}
        onConfirm={confirm}
      >
        <TextareaField
          label="Lý do"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          required
          error={errors.reason || localError}
        />
        {change.isError && <Alert tone="danger">{change.error.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}
