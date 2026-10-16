import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { CircleAlert, ClipboardCheck, PartyPopper, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

type Tab = 'direct' | 'proposed';
const TABS: { key: Tab; label: string }[] = [
  { key: 'direct', label: 'Nhận lớp dạy' },
  { key: 'proposed', label: 'Nhận lớp được đề xuất' },
];

const linkClass =
  'font-semibold text-primary underline underline-offset-4 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function To({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={linkClass}>
      {children}
    </Link>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Numbered steps; each step is one or more paragraphs from the centre's guide. */
function Steps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((step, index) => (
        <li
          key={index}
          className="flex items-start gap-4 rounded-xl border border-border bg-bg p-4 shadow-card"
        >
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary"
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 pt-1.5 leading-relaxed">{step}</div>
        </li>
      ))}
    </ol>
  );
}

function Notes({ items }: { items: ReactNode[] }) {
  return (
    <section
      aria-label="Lưu ý"
      className="rounded-xl border border-accent bg-warning-surface p-5 leading-relaxed"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
        <CircleAlert aria-hidden="true" className="size-5 text-warning" />
        Lưu ý
      </h2>
      <Bullets items={items} />
    </section>
  );
}

function Closing() {
  return (
    <p className="flex items-start gap-3 rounded-xl bg-info-surface p-5 font-medium text-primary">
      <PartyPopper aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      Chúc bạn sớm tìm được lớp học phù hợp và có những trải nghiệm giảng dạy tốt cùng Trung tâm Gia
      sư Sư phạm Đỗ Hằng!
    </p>
  );
}

/** Steps shared by both ways of taking a class, once the tutor has the learner's contact. */
const AFTER_CONTACT_STEPS: ReactNode[] = [
  <>
    Sau khi nhận được thông tin liên hệ của phụ huynh/học viên, gia sư cần chủ động liên hệ trong
    vòng 12 giờ để trao đổi về nhu cầu học tập, lịch học, địa điểm và các nội dung liên quan.
  </>,
  <>
    Nếu phát hiện thông tin thực tế khác với yêu cầu hoặc thỏa thuận ban đầu, gia sư cần thông báo
    cho Trung tâm trong vòng 24 giờ kể từ thời điểm phát hiện để được hỗ trợ xác minh và giải quyết.
  </>,
  <>
    Sau khi trao đổi với phụ huynh/học viên, gia sư chủ động thống nhất lịch học và sắp xếp buổi học
    đầu tiên trong vòng 15 ngày kể từ ngày nhận lớp.
  </>,
  <>
    Gia sư thực hiện 01 buổi dạy thử miễn phí để phụ huynh/học viên đánh giá chất lượng giảng dạy.
    Nếu hai bên thống nhất tiếp tục, gia sư giảng dạy theo lịch đã thỏa thuận.
  </>,
];

function DirectTab() {
  return (
    <div className="flex flex-col gap-6">
      <p className="leading-relaxed">
        Chào mừng bạn đến với Trung tâm Gia sư Sư phạm Đỗ Hằng! Hãy thực hiện theo các bước dưới đây
        để tìm kiếm và nhận lớp phù hợp.
      </p>
      <Steps
        steps={[
          <>
            Truy cập <To to="/tutor/profile">Hồ sơ gia sư</To> để cập nhật đầy đủ thông tin cá nhân,
            trình độ học vấn, kinh nghiệm, bằng cấp. Bổ sung thẻ sinh viên, bằng cấp hoặc giấy tờ
            liên quan để Trung tâm xác minh thông tin.
          </>,
          <>
            Truy cập <To to="/tutor/new-classes">Tìm kiếm lớp dạy → Danh sách lớp mới</To>. Xem
            thông tin chi tiết của từng lớp, bao gồm môn học, khối lớp, địa điểm, lịch học, mức học
            phí và phí nhận lớp.
          </>,
          <>
            Chọn lớp phù hợp với chuyên môn, lịch trình và khả năng giảng dạy, sau đó gửi yêu cầu
            nhận lớp trên hệ thống. Theo dõi kết quả tại mục{' '}
            <To to="/tutor/class-requests">Tìm kiếm lớp dạy → Yêu cầu nhận lớp</To>.
          </>,
          <>
            Sau khi yêu cầu nhận lớp được Trung tâm phê duyệt, gia sư thực hiện các thủ tục sau:
            <Bullets
              items={[
                <>
                  <strong>Đối với lần nhận lớp đầu tiên:</strong> Đến trực tiếp Trung tâm để ký hợp
                  đồng nhận lớp và chuyển khoản phí môi giới theo mức phí được Trung tâm thông báo,
                  xác nhận.
                </>,
                <>
                  <strong>Đối với lần nhận lớp thứ hai trở đi:</strong> Gia sư thanh toán phí nhận
                  lớp theo thông báo sau khi yêu cầu nhận lớp được phê duyệt.
                </>,
              ]}
            />
          </>,
          ...AFTER_CONTACT_STEPS,
        ]}
      />
      <Notes
        items={[
          'Chỉ đăng ký những lớp phù hợp với chuyên môn, năng lực và thời gian của bản thân.',
          'Cung cấp thông tin trung thực, đầy đủ và xuất trình giấy tờ cần thiết khi Trung tâm yêu cầu.',
          'Không tự ý thay đổi người dạy, lịch học, học phí hoặc các thỏa thuận đã thống nhất khi chưa có sự đồng ý của các bên liên quan.',
          'Chủ động phối hợp với Trung tâm và phụ huynh/học viên trong quá trình nhận lớp, giảng dạy.',
          'Khi phát sinh vấn đề, hãy thông báo kịp thời cho Trung tâm để được hỗ trợ.',
        ]}
      />
      <Closing />
    </div>
  );
}

function ProposedTab() {
  return (
    <div className="flex flex-col gap-6">
      <p className="leading-relaxed">
        Tại Trung tâm Gia sư Sư phạm Đỗ Hằng, gia sư có thể chủ động đăng ký lớp học phù hợp để hệ
        thống gợi ý những lớp học phù hợp với chuyên môn, lịch trình và khu vực có thể dạy. Hãy thực
        hiện theo các bước sau:
      </p>
      <Steps
        steps={[
          <>
            Vào trang hồ sơ gia sư, lựa chọn tab{' '}
            <To to="/tutor/profile?tab=dang-ky">“Đăng ký lớp học phù hợp”</To>
          </>,
          <>
            Cập nhật các thông tin phù hợp với năng lực và điều kiện giảng dạy của bản thân:
            <Bullets
              items={[
                <>
                  <strong>Môn học có thể dạy:</strong> Tích chọn các môn có đủ kiến thức và năng lực
                  giảng dạy
                </>,
                <>
                  <strong>Lớp có thể dạy:</strong> Chọn các khối lớp từ lớp 1 đến lớp 12, tiền tiểu
                  học hoặc ôn thi đại học.
                </>,
                <>
                  <strong>Hình thức dạy:</strong> Chọn hình thức trực tiếp tại nhà học sinh hoặc địa
                  điểm đã thống nhất, hình thức trực tuyến hoặc cả hai.
                </>,
                <>
                  <strong>Khu vực có thể dạy:</strong> Chọn các quận/huyện tại Hà Nội mà bạn có thể
                  di chuyển đến, ví dụ Thanh Xuân, Cầu Giấy, Hai Bà Trưng, Đống Đa.
                </>,
                <>
                  <strong>Thời gian có thể dạy:</strong> Tại bảng thời gian, chọn các ô tương ứng
                  với ngày trong tuần và khung giờ có thể giảng dạy. Bạn có thể chọn nhiều khung
                  giờ, nhấn lại để bỏ chọn hoặc sử dụng chức năng “Xóa lựa chọn” để chọn lại từ đầu.
                  Nếu thời gian có thể thay đổi, tích chọn “Linh hoạt — trao đổi thời gian với phụ
                  huynh”.
                </>,
              ]}
            />
          </>,
          <>
            Kiểm tra lại các thông tin đã chọn và nhấn “Lưu thay đổi”. Hệ thống lưu thông tin để sử
            dụng khi tìm kiếm và gợi ý lớp học phù hợp.
            <p className="mt-2 text-muted">
              Bạn có thể quay lại chỉnh sửa môn học, khối lớp, hình thức dạy, khu vực hoặc thời gian
              bất cứ khi nào cần.
            </p>
          </>,
          <>
            Sau khi đăng ký thông tin phù hợp, truy cập{' '}
            <To to="/tutor/class-requests">
              Tìm kiếm lớp dạy → Yêu cầu nhận lớp → Lớp học được đề xuất
            </To>{' '}
            để xem danh sách lớp học do Trung tâm đề xuất.
            <p className="mt-2">
              Với mỗi lớp được đề xuất, hãy xem xét môn học, khối lớp, địa điểm, lịch học, mức thù
              lao và các yêu cầu liên quan.
            </p>
            <Bullets
              items={[
                <>
                  <strong>Nếu đồng ý nhận lớp:</strong> Chọn “Xác nhận nhận lớp” để gửi xác nhận đến
                  Trung tâm.
                </>,
                <>
                  <strong>Nếu từ chối nhận lớp:</strong> Chọn “Từ chối” và nhập lý do từ chối theo
                  yêu cầu của hệ thống.
                </>,
              ]}
            />
            <p className="mt-2">
              Sau khi xác nhận, gia sư chờ Trung tâm xem xét và phê duyệt yêu cầu nhận lớp.
            </p>
          </>,
          <>
            Sau khi xác nhận nhận lớp, gia sư cần:
            <Bullets
              items={[
                <>
                  <strong>Đối với lần nhận lớp đầu tiên:</strong> Đến trực tiếp Trung tâm để ký hợp
                  đồng nhận lớp và chuyển khoản phí môi giới theo mức phí được Trung tâm thông báo,
                  xác nhận.
                </>,
                <>
                  <strong>Đối với lần nhận lớp thứ hai trở đi:</strong> Thanh toán phí nhận lớp theo
                  thông báo sau khi yêu cầu nhận lớp được phê duyệt.
                </>,
              ]}
            />
          </>,
          ...AFTER_CONTACT_STEPS,
        ]}
      />
      <Notes
        items={[
          'Chỉ đăng ký những lớp phù hợp với chuyên môn, năng lực và thời gian của bản thân.',
          'Cung cấp thông tin trung thực, đầy đủ và xuất trình giấy tờ cần thiết khi Trung tâm yêu cầu.',
          'Việc đăng ký thông tin phù hợp hoặc được đề xuất lớp đồng nghĩa với việc yêu cầu nhận lớp không cần mất thời gian chờ phê duyệt. Gia sư cần xác nhận nhận lớp và hoàn tất thanh toán phí nhận lớp',
          'Không tự ý thay đổi người dạy, lịch học, học phí hoặc các thỏa thuận đã thống nhất khi chưa có sự đồng ý của các bên liên quan.',
          'Chủ động phối hợp với Trung tâm và phụ huynh/học viên trong quá trình nhận lớp, giảng dạy. Khi phát sinh vấn đề, hãy thông báo kịp thời cho Trung tâm để được hỗ trợ.',
        ]}
      />
      <Closing />
    </div>
  );
}

/** "Cách thức nhận lớp": the centre's guide for taking a class directly or by proposal. */
export function TutorHowToAcceptPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'de-xuat' ? 'proposed' : 'direct';
  const ids = { direct: useId(), proposed: useId() };

  function select(next: Tab) {
    const search = new URLSearchParams(params);
    if (next === 'proposed') search.set('tab', 'de-xuat');
    else search.delete('tab');
    setParams(search, { replace: true, preventScrollReset: true });
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next: Tab = tab === 'direct' ? 'proposed' : 'direct';
    select(next);
    document.getElementById(`${ids[next]}-tab`)?.focus();
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold text-primary">Cách thức nhận lớp</h1>
        <p className="mt-2 text-muted">
          Hướng dẫn nhận lớp dạy tại Trung tâm Gia sư Sư phạm Đỗ Hằng
        </p>
      </header>
      <div
        role="tablist"
        aria-label="Cách thức nhận lớp"
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {TABS.map(({ key, label }) => {
          const Icon = key === 'direct' ? ClipboardCheck : Sparkles;
          return (
            <button
              key={key}
              id={`${ids[key]}-tab`}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls={`${ids[key]}-panel`}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => select(key)}
              onKeyDown={onKey}
              className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                tab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary'
              }`}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </button>
          );
        })}
      </div>
      {TABS.map(({ key }) => (
        <div
          key={key}
          id={`${ids[key]}-panel`}
          role="tabpanel"
          aria-labelledby={`${ids[key]}-tab`}
          hidden={tab !== key}
        >
          {tab === key && (key === 'direct' ? <DirectTab /> : <ProposedTab />)}
        </div>
      ))}
    </section>
  );
}
