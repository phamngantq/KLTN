import { Printer } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { TutorProfile } from '../../../shared/schemas/tutors';
import { Button } from '../../components/ui/Button';
import { PageLoading } from '../../components/ui/Spinner';
import { usePublishedContent } from '../../features/content/api';
import { useOwnProfile } from '../../features/tutor-profile/api';

/** Bên A as printed on the contract. Unknown facts stay blank (dotted) rather than invented. */
const PARTY_A = {
  company: 'CÔNG TY GIÁO DỤC GROWGREEN',
  centre: 'TRUNG TÂM GIA SƯ GROWGREEN',
  name: 'Trung tâm Gia sư GrowGreen',
  address: 'Số 41 Khuất Duy Tiến, Thanh Xuân, Hà Nội',
  phone: '0394 618 480',
  email: 'tuyendunggiasugio@gmail.com',
  website: null as string | null,
};

interface Article {
  title: string;
  paragraphs: string[];
}

/** Used when the centre has not published its own contract text as "Điều 1…" sections. */
const DEFAULT_ARTICLES: Article[] = [
  {
    title: 'Điều 1. Nội dung hợp đồng',
    paragraphs: [
      '1.1. Bên A giới thiệu cho Bên B lớp học phù hợp với chuyên môn và thời gian của Bên B; thông tin lớp (môn học, khối lớp, địa điểm, lịch học, học phí) được ghi trong phụ lục hoặc thư giới thiệu kèm theo hợp đồng này.',
      '1.2. Bên B nhận lớp, trực tiếp giảng dạy theo đúng lịch học và nội dung đã thống nhất với phụ huynh/học viên.',
    ],
  },
  {
    title: 'Điều 2. Phí nhận lớp và phương thức thanh toán',
    paragraphs: [
      '2.1. Bên B thanh toán cho Bên A phí nhận lớp theo bảng giá hiện hành của Bên A: 40% × học phí một buổi × số buổi mỗi tuần × 4 tuần.',
      '2.2. Phí nhận lớp được thanh toán bằng tiền mặt tại văn phòng Bên A hoặc chuyển khoản vào tài khoản của Bên A trước khi Bên B nhận thông tin liên hệ của phụ huynh/học viên.',
      '2.3. Việc hoàn phí (nếu có) thực hiện theo quy định hoàn phí do Bên A công bố tại thời điểm ký hợp đồng.',
    ],
  },
  {
    title: 'Điều 3. Quyền và nghĩa vụ của Bên A',
    paragraphs: [
      '3.1. Cung cấp đầy đủ, trung thực thông tin lớp học và thư giới thiệu cho Bên B sau khi Bên B hoàn tất thủ tục nhận lớp.',
      '3.2. Hỗ trợ, phối hợp giải quyết các vướng mắc phát sinh giữa Bên B và phụ huynh/học viên trong quá trình giảng dạy.',
      '3.3. Bảo mật thông tin cá nhân của Bên B, chỉ sử dụng cho mục đích giới thiệu và quản lý lớp học.',
    ],
  },
  {
    title: 'Điều 4. Quyền và nghĩa vụ của Bên B',
    paragraphs: [
      '4.1. Giảng dạy đúng lịch, đúng nội dung, có trách nhiệm với kết quả học tập của học viên; báo trước cho phụ huynh và Bên A khi cần nghỉ hoặc đổi buổi.',
      '4.2. Không tự ý thay đổi người dạy, lịch học, học phí hoặc các thỏa thuận đã thống nhất khi chưa có sự đồng ý của các bên liên quan.',
      '4.3. Giữ bí mật thông tin của phụ huynh/học viên; không chuyển giao lớp cho người khác.',
      '4.4. Cung cấp thông tin cá nhân, giấy tờ trung thực và chịu trách nhiệm về tính chính xác của các thông tin đã cung cấp.',
    ],
  },
  {
    title: 'Điều 5. Chấm dứt hợp đồng',
    paragraphs: [
      '5.1. Hợp đồng chấm dứt khi lớp học kết thúc theo thỏa thuận, hoặc khi một trong hai bên vi phạm nghĩa vụ đã cam kết.',
      '5.2. Bên muốn chấm dứt hợp đồng trước thời hạn phải thông báo cho bên kia và phụ huynh/học viên trước ít nhất 03 ngày.',
    ],
  },
  {
    title: 'Điều 6. Điều khoản chung',
    paragraphs: [
      '6.1. Hai bên cam kết thực hiện đúng các điều khoản của hợp đồng. Tranh chấp phát sinh được giải quyết trên tinh thần thương lượng; nếu không thương lượng được sẽ đưa ra cơ quan có thẩm quyền theo quy định của pháp luật.',
      '6.2. Hợp đồng có hiệu lực kể từ ngày ký, được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.',
    ],
  },
];

/** Reads "Điều 1. …" sections from the centre's published contract text, if written that way. */
export function articlesFrom(text: string | undefined): Article[] | null {
  if (!text) return null;
  const articles: Article[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^Điều\s+\d+/i.test(line)) articles.push({ title: line, paragraphs: [] });
    else if (articles.length) articles[articles.length - 1]!.paragraphs.push(line);
  }
  return articles.length ? articles : null;
}

const DOTS = '…………………………………………';

function dateVi(iso: string | null): string | null {
  if (!iso) return null;
  const [year, month, day] = iso.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : null;
}

/** One "Label: value" line; a missing value prints a dotted line to fill in by hand. */
function Line({ label, value }: { label: string; value: ReactNode | null | undefined }) {
  return (
    <p className="flex gap-2">
      <span className="shrink-0">{label}:</span>
      {value ? (
        <span className="font-semibold">{value}</span>
      ) : (
        <span aria-label="Để trống" className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
          {DOTS}
          {DOTS}
        </span>
      )}
    </p>
  );
}

const SHEET: CSSProperties = {
  fontFamily: '"Times New Roman", Times, "Liberation Serif", serif',
  backgroundColor: '#ffffff',
  color: '#000000',
};

/**
 * "Hợp đồng mẫu" for tutors: an A4 administrative contract. Bên B is filled from the signed-in
 * tutor's own profile; the articles come from the centre's published contract when it is
 * written as "Điều …" sections, otherwise the standard template below.
 */
export function TutorContractTemplatePage() {
  const profile = useOwnProfile();
  const content = usePublishedContent('contract', 'tutor-class-contract', 'tutor');
  if (profile.isPending) return <PageLoading label="Đang tải hợp đồng mẫu…" />;
  const tutor: TutorProfile | null = profile.data ?? null;
  const articles = articlesFrom(content.data?.bodyText) ?? DEFAULT_ARTICLES;

  return (
    <section className="mx-auto flex w-full min-w-0 max-w-[230mm] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-3xl font-semibold text-primary">Hợp đồng mẫu</h1>
        <Button onClick={() => window.print()} className="gap-2">
          <Printer aria-hidden="true" className="size-4" />
          In / Lưu PDF
        </Button>
      </div>
      <div className="min-w-0 overflow-x-auto print:overflow-visible">
        <article
          aria-label="Hợp đồng gia sư"
          style={SHEET}
          className="mx-auto box-border min-h-[297mm] w-[210mm] max-w-none px-[20mm] py-[18mm] text-[13pt] leading-[1.5] shadow-card print:min-h-0 print:w-auto print:p-0 print:shadow-none"
        >
          <header className="grid grid-cols-[2fr_3fr] gap-2 whitespace-nowrap text-center text-[11pt]">
            <div className="font-bold uppercase leading-snug">
              <p>{PARTY_A.company}</p>
              <p>{PARTY_A.centre}</p>
              <p aria-hidden="true" className="mx-auto mt-1 w-24 border-t border-black" />
            </div>
            <div className="font-bold leading-snug">
              <p className="uppercase">Cộng hòa xã hội chủ nghĩa Việt Nam</p>
              <p>Độc lập - Tự do - Hạnh phúc</p>
              <p aria-hidden="true" className="mx-auto mt-1 w-40 border-t border-black" />
            </div>
          </header>

          <div className="mt-8 text-center">
            <h2 className="text-[16pt] font-bold uppercase">Hợp đồng gia sư</h2>
            <p className="mt-1">Số: ………/HĐGS-GG</p>
            <p className="italic">Hà Nội, ngày …… tháng …… năm 20……</p>
          </div>

          <div className="mt-6 flex flex-col gap-1 text-justify">
            <p className="italic">
              - Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24 tháng 11 năm 2015;
            </p>
            <p className="italic">- Căn cứ nhu cầu và khả năng thực hiện của hai bên.</p>
            <p className="mt-2">Hôm nay, tại văn phòng {PARTY_A.name}, chúng tôi gồm:</p>
          </div>

          <section aria-label="Bên A" className="mt-4 flex flex-col gap-0.5">
            <h3 className="font-bold uppercase">A/ Bên A (Bên giới thiệu): {PARTY_A.name}</h3>
            <Line label="Địa chỉ" value={PARTY_A.address} />
            <Line label="Điện thoại" value={PARTY_A.phone} />
            <Line label="Email" value={PARTY_A.email} />
            <Line label="Website" value={PARTY_A.website} />
            <Line label="Đại diện" value={null} />
          </section>

          <section aria-label="Bên B" className="mt-4 flex flex-col gap-0.5">
            <h3 className="font-bold uppercase">B/ Bên B (Gia sư)</h3>
            <Line label="Họ và tên" value={tutor?.displayName} />
            <Line label="Ngày sinh" value={dateVi(tutor?.dateOfBirth ?? null)} />
            <div className="grid grid-cols-2 gap-x-4">
              <Line label="Số CCCD" value={tutor?.idNumber} />
              <Line label="Ngày cấp" value={dateVi(tutor?.idIssuedOn ?? null)} />
            </div>
            <div className="grid grid-cols-2 gap-x-4">
              <Line label="Điện thoại" value={tutor?.phone} />
              <Line label="Email" value={tutor?.email} />
            </div>
            <Line label="Hộ khẩu thường trú" value={tutor?.idResidence} />
            <Line label="Trường học" value={tutor?.school} />
          </section>

          <p className="mt-4 text-justify">
            Sau khi bàn bạc, hai bên thống nhất ký kết hợp đồng gia sư với các điều khoản sau:
          </p>

          <div className="mt-3 flex flex-col gap-3">
            {articles.map((article) => (
              <section key={article.title} className="break-inside-avoid">
                <h3 className="font-bold">{article.title}</h3>
                {article.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-justify indent-[10mm]">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>

          <footer className="mt-10 grid grid-cols-2 gap-6 text-center break-inside-avoid">
            <div>
              <p className="font-bold uppercase">Đại diện Bên A</p>
              <p className="italic">(Ký, ghi rõ họ tên, đóng dấu)</p>
              <div className="h-28" />
            </div>
            <div>
              <p className="font-bold uppercase">Bên B</p>
              <p className="italic">(Ký, ghi rõ họ tên)</p>
              <div className="h-28" />
              {tutor?.displayName && <p className="font-semibold">{tutor.displayName}</p>}
            </div>
          </footer>
        </article>
      </div>
    </section>
  );
}
