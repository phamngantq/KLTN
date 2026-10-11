import { Link } from 'react-router';
import { PageHeader } from '../../components/ui/Feedback';

const SETTINGS = [
  {
    to: '/admin/pricing',
    title: 'Bảng giá & phí',
    description:
      'Công bố học phí tham khảo, khoảng phí theo hình thức và ba phương án phí để gia sư lựa chọn khi ứng tuyển.',
  },
  {
    to: '/admin/terms/quiz',
    title: 'Bài kiểm tra điều khoản',
    description: 'Quản lý bài kiểm tra bắt buộc trước khi gia sư ứng tuyển.',
  },
  {
    to: '/admin/content/terms',
    title: 'Nội dung điều khoản',
    description: 'Biên tập và công bố phiên bản điều khoản trách nhiệm.',
  },
  {
    to: '/admin/content/contracts',
    title: 'Mẫu hợp đồng',
    description: 'Biên tập nội dung hợp đồng trước khi phát hành cho lớp được giao.',
  },
  {
    to: '/admin/services',
    title: 'Dịch vụ',
    description: 'Quản lý nội dung dịch vụ hiển thị công khai.',
  },
  {
    to: '/admin/content/pages',
    title: 'Trang thông tin',
    description: 'Quản lý giới thiệu, liên hệ và nội dung công khai.',
  },
  {
    to: '/admin/content/blog',
    title: 'Bài viết',
    description: 'Quản lý bài viết cho phụ huynh và gia sư.',
  },
  {
    to: '/admin/users',
    title: 'Tài khoản',
    description: 'Xem tài khoản và kiểm soát trạng thái truy cập.',
  },
] as const;

export function AdminSettingsPage() {
  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title="Cài đặt và nội dung"
        description="Các cấu hình có quy trình lưu và công bố trên hệ thống."
      />
      <ul className="grid gap-3 md:grid-cols-2">
        {SETTINGS.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="block h-full rounded-lg border border-border bg-bg p-5 shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus hover:border-primary"
            >
              <h2 className="font-semibold text-primary">{item.title}</h2>
              <p className="mt-2 text-sm text-muted">{item.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
