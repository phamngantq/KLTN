import { Link } from 'react-router';
import { ButtonLink } from '../../components/ui/Button';

type PageKind =
  | 'about'
  | 'services'
  | 'pricing'
  | 'classes'
  | 'blog-parent'
  | 'blog-tutor'
  | 'blog-article'
  | 'contact'
  | 'password-help';

const CONTENT: Record<PageKind, { eyebrow: string; title: string; intro: string; status: string }> =
  {
    about: {
      eyebrow: 'GIỚI THIỆU',
      title: 'Kết nối phụ huynh và gia sư',
      intro:
        'Bản thiết kế mới hướng tới hành trình phụ huynh gửi yêu cầu, gia sư ứng tuyển và kiểm duyệt viên điều phối lớp học.',
      status:
        'Luồng ghép lớp đang được triển khai. Bạn vẫn có thể xem hồ sơ gia sư trong hệ thống hiện tại.',
    },
    services: {
      eyebrow: 'DỊCH VỤ',
      title: 'Dịch vụ tìm gia sư',
      intro:
        'Trang dịch vụ sẽ giải thích cách gửi yêu cầu, chọn gia sư và theo dõi lớp học khi quy trình mới được đưa vào hoạt động.',
      status: 'Các gói dịch vụ và điều kiện áp dụng chưa được công bố.',
    },
    pricing: {
      eyebrow: 'BẢNG GIÁ',
      title: 'Bảng giá đang được xác nhận',
      intro:
        'Mức học phí và phí nhận lớp cần có chính sách được duyệt trước khi hiển thị hoặc áp dụng cho giao dịch.',
      status:
        'Hiện chưa có bảng giá chính thức trên hệ thống này. Không thực hiện thanh toán qua trang này.',
    },
    classes: {
      eyebrow: 'LỚP HỌC',
      title: 'Danh sách lớp học',
      intro:
        'Lớp học sẽ xuất hiện tại đây khi yêu cầu được kiểm tra và kiểm duyệt viên xuất bản từ dữ liệu thật.',
      status:
        'Chưa có danh sách lớp để đăng ký trực tuyến. Chức năng ứng tuyển lớp đang được triển khai.',
    },
    'blog-parent': {
      eyebrow: 'TIN TỨC',
      title: 'Tin cho phụ huynh',
      intro: 'Bài viết sẽ được hiển thị sau khi nội dung được biên tập và xuất bản.',
      status: 'Chưa có bài viết được công bố.',
    },
    'blog-tutor': {
      eyebrow: 'TIN TỨC',
      title: 'Tin cho gia sư',
      intro: 'Bài viết sẽ được hiển thị sau khi nội dung được biên tập và xuất bản.',
      status: 'Chưa có bài viết được công bố.',
    },
    'blog-article': {
      eyebrow: 'TIN TỨC',
      title: 'Bài viết chưa khả dụng',
      intro:
        'Nội dung bài viết sẽ được hiển thị sau khi có nguồn bài viết đã được biên tập và xuất bản.',
      status: 'Chưa có nội dung bài viết để hiển thị tại đường dẫn này.',
    },
    contact: {
      eyebrow: 'LIÊN HỆ',
      title: 'Thông tin liên hệ',
      intro:
        'Thông tin liên hệ và biểu mẫu gửi tin sẽ được mở khi kênh tiếp nhận được xác nhận và kết nối với hệ thống.',
      status:
        'Chưa có số điện thoại, địa chỉ hoặc biểu mẫu liên hệ chính thức được công bố tại đây.',
    },
    'password-help': {
      eyebrow: 'TÀI KHOẢN',
      title: 'Khôi phục mật khẩu',
      intro: 'Hệ thống chưa có dịch vụ xác minh email để khôi phục mật khẩu một cách an toàn.',
      status:
        'Chức năng khôi phục mật khẩu chưa khả dụng. Trang này không gửi email hoặc thay đổi mật khẩu.',
    },
  };

/** Public Figma routes without an approved content source show a truthful state. */
export function PublicInfoPage({ kind }: { kind: PageKind }) {
  const content = CONTENT[kind];

  return (
    <>
      <section className="bg-gradient-to-br from-primary to-primary-gradient-end px-4 py-12 text-on-primary md:py-16">
        <div className="mx-auto max-w-[var(--container-max)]">
          <p className="text-sm font-semibold tracking-wide text-accent">{content.eyebrow}</p>
          <h1 className="mt-3 max-w-3xl text-3xl leading-tight font-bold md:text-4xl">
            {content.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-on-primary/90">{content.intro}</p>
        </div>
      </section>
      <section className="mx-auto max-w-[var(--container-max)] px-4 py-12">
        <div className="max-w-3xl rounded-lg border border-border bg-surface p-6 shadow-card">
          <h2 className="text-xl font-semibold text-primary">Trạng thái hiện tại</h2>
          <p className="mt-2 text-muted">{content.status}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink to="/">Về trang chủ</ButtonLink>
            {(kind === 'about' || kind === 'services') && (
              <ButtonLink to="/tutors" variant="secondary">
                Xem gia sư hiện có
              </ButtonLink>
            )}
          </div>
        </div>
        {(kind === 'blog-parent' || kind === 'blog-tutor') && (
          <p className="mt-6 text-sm text-muted">
            {kind === 'blog-parent' ? 'Bạn là gia sư?' : 'Bạn là phụ huynh?'}{' '}
            <Link
              to={kind === 'blog-parent' ? '/blog/gia-su' : '/blog/phu-huynh'}
              className="font-medium text-primary underline underline-offset-4"
            >
              Xem chuyên mục còn lại
            </Link>
          </p>
        )}
      </section>
    </>
  );
}
