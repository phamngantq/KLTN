import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, LockKeyhole, Search, UnlockKeyhole, UserRound, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { UserRole } from '../../../shared/schemas/auth';
import type { AdminUser } from '../../../shared/schemas/admin-users';
import type { Page } from '../../../shared/schemas/discovery';
import { isReadOnlyPreview } from '../../app/preview';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { SelectField, TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import { api, fieldErrors, toQuery } from '../../lib/api-client';
import { formatDate } from '../../lib/format';

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
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
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
    onSuccess: (updated) => {
      setDetailUser((current) => (current?.id === updated.id ? updated : current));
      return queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateList(searchParams(role, status, searchText.trim(), 1));
  }

  function navigateList(next: URLSearchParams) {
    setDetailUser(null);
    setParams(next);
  }

  function openStatusDialog(user: AdminUser) {
    change.reset();
    setNotice('');
    setLocalError('');
    setReason('');
    setSelected(user);
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
    <section className="flex min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold text-primary">Quản lý người dùng</h1>
        <p className="mt-2 text-muted">Quản lý thông tin người dùng trong hệ thống</p>
      </header>
      {isReadOnlyPreview() && (
        <Alert tone="info">
          Bản xem trước chỉ cho phép xem tài khoản; thao tác khóa và mở khóa cần môi trường có quyền
          ghi.
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="rounded-xl border border-border bg-bg p-4 shadow-card sm:p-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_minmax(10rem,1fr)] md:items-end">
          <form className="flex min-w-0 items-end gap-2" onSubmit={submitSearch}>
            <div className="relative min-w-0 flex-1">
              <TextField
                label="Tìm tên hoặc email"
                placeholder="Tìm kiếm theo tên hoặc email..."
                className="pl-10"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                maxLength={100}
              />
              <Search aria-hidden="true" className="absolute bottom-3 left-3 size-4 text-muted" />
            </div>
            <Button type="submit">Tìm</Button>
          </form>
          <SelectField
            label="Vai trò"
            value={role}
            onChange={(event) =>
              navigateList(searchParams(event.target.value as UserRole | '', status, search, 1))
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
              navigateList(searchParams(role, event.target.value as UserStatus | '', search, 1))
            }
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="suspended">Đã khóa</option>
          </SelectField>
        </div>
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
          <div className="overflow-hidden rounded-xl border border-border bg-bg shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 sm:px-6">
              <h2 className="font-semibold text-primary">Danh sách người dùng</h2>
              <p className="text-sm text-muted" role="status">
                {users.data.total} tài khoản phù hợp · Trang {users.data.page}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <caption className="sr-only">Tài khoản theo bộ lọc hiện tại</caption>
                <thead className="border-b border-border bg-surface text-primary">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Mã người dùng
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Họ và tên
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Email
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Vai trò
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Ngày tham gia
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Trạng thái
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Hành động
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.data.items.map((user) => (
                    <tr key={user.id} className="hover:bg-surface">
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="block max-w-28 truncate" title={user.id}>
                          {user.id}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-primary">{user.displayName}</td>
                      <td className="px-4 py-3 text-muted">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge>{ROLE_LABELS[user.role]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {formatDate(user.createdAt, 'Asia/Ho_Chi_Minh')}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={user.status === 'active' ? 'success' : 'warning'}>
                          {user.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={() => setDetailUser(user)}>
                            <Eye aria-hidden="true" className="size-4" />
                            Chi tiết
                          </Button>
                          {user.role !== 'admin' && (
                            <Button
                              variant={user.status === 'active' ? 'danger' : 'secondary'}
                              size="sm"
                              disabled={isReadOnlyPreview()}
                              aria-label={
                                user.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'
                              }
                              onClick={() => openStatusDialog(user)}
                            >
                              {user.status === 'active' ? (
                                <LockKeyhole aria-hidden="true" className="size-4" />
                              ) : (
                                <UnlockKeyhole aria-hidden="true" className="size-4" />
                              )}
                              {user.status === 'active' ? 'Khóa' : 'Mở khóa'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav
              aria-label="Trang tài khoản"
              className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-4 py-4 sm:px-6"
            >
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => navigateList(searchParams(role, status, search, page - 1))}
              >
                Trang trước
              </Button>
              <span className="text-sm text-muted">
                Trang {page} / {Math.max(1, Math.ceil(users.data.total / users.data.pageSize))}
              </span>
              <Button
                variant="secondary"
                disabled={page * users.data.pageSize >= users.data.total}
                onClick={() => navigateList(searchParams(role, status, search, page + 1))}
              >
                Trang sau
              </Button>
            </nav>
          </div>
          {detailUser && (
            <section
              className="overflow-hidden rounded-xl border border-border bg-bg shadow-card"
              aria-labelledby="user-detail-heading"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
                <div>
                  <h2
                    id="user-detail-heading"
                    className="flex items-center gap-2 text-lg font-semibold text-primary"
                  >
                    <UserRound aria-hidden="true" className="size-5" />
                    {detailUser.role === 'tutor'
                      ? 'Hồ sơ gia sư'
                      : detailUser.role === 'student'
                        ? 'Thông tin phụ huynh'
                        : 'Thông tin kiểm duyệt viên'}
                  </h2>
                  <p className="mt-1 text-sm text-muted">Thông tin tài khoản từ hệ thống</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDetailUser(null)}
                  aria-label="Đóng chi tiết"
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </div>
              <dl className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
                <div>
                  <dt className="text-sm text-muted">Mã người dùng</dt>
                  <dd className="break-all font-medium">{detailUser.id}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Họ và tên</dt>
                  <dd className="font-medium">{detailUser.displayName}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Email</dt>
                  <dd className="break-all font-medium">{detailUser.email}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Vai trò</dt>
                  <dd className="font-medium">{ROLE_LABELS[detailUser.role]}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Ngày tham gia</dt>
                  <dd className="font-medium">
                    {formatDate(detailUser.createdAt, 'Asia/Ho_Chi_Minh')}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Trạng thái</dt>
                  <dd>
                    <Badge tone={detailUser.status === 'active' ? 'success' : 'warning'}>
                      {detailUser.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                    </Badge>
                  </dd>
                </div>
              </dl>
              {detailUser.role !== 'admin' && (
                <div className="flex justify-end border-t border-border bg-surface px-4 py-4 sm:px-6">
                  <Button
                    variant={detailUser.status === 'active' ? 'danger' : 'secondary'}
                    disabled={isReadOnlyPreview()}
                    onClick={() => openStatusDialog(detailUser)}
                  >
                    {detailUser.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                  </Button>
                </div>
              )}
            </section>
          )}
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
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-3 text-sm font-medium text-primary">
            {selected?.displayName} · {selected ? ROLE_LABELS[selected.role] : ''}
          </p>
          <TextareaField
            label="Lý do"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            required
            error={errors.reason || localError}
          />
        </div>
        {change.isError && <Alert tone="danger">{change.error.message}</Alert>}
      </ConfirmDialog>
    </section>
  );
}
