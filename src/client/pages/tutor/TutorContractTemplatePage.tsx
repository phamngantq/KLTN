import { Printer } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { TutorProfile } from '../../../shared/schemas/tutors';
import { Button } from '../../components/ui/Button';
import { PageLoading } from '../../components/ui/Spinner';
import { useOwnProfile } from '../../features/tutor-profile/api';

const CENTRE = 'Trung tâm Gia sư Sư phạm Đỗ Hằng';
const CENTRE_ADDRESS = 'Tầng 7, Số 41–43, Đường Khuất Duy Tiến, P. Thanh Xuân, TP Hà Nội.';
const CENTRE_PHONE = '0394 618 480';
const CENTRE_EMAIL = 'tuyendunggiasugio@gmail.com';

/** Body blocks of one article, in reading order. */
type Block =
  | { kind: 'p'; text: string }
  | { kind: 'sub'; text: string }
  | { kind: 'item'; text: string }
  | { kind: 'refunds' };

interface Article {
  title: string;
  blocks: Block[];
}

const p = (text: string): Block => ({ kind: 'p', text });
const sub = (text: string): Block => ({ kind: 'sub', text });
const item = (text: string): Block => ({ kind: 'item', text });

/** "Bảng 5.1" — refund levels per class. */
const REFUNDS: [string, string, string][] = [
  [
    'Mức 1',
    '100%',
    'Bên A cung cấp sai thông tin về lớp dạy, nhu cầu học của PH/HV; PH/HV thay đổi nhu cầu không học trước khi Bên B gọi điện trao đổi, gặp mặt; Các bên không thỏa thuận được nội dung phát sinh thêm so với nhu cầu ban đầu; PH/HV không bố trí được buổi học đầu tiên trong 15 ngày kể từ ngày Bên B nhận lớp mà không do lỗi hoặc vi phạm của Bên B.',
  ],
  [
    'Mức 2',
    '75%',
    'PH/HV báo nghỉ do không hài lòng về cách trao đổi của Bên B (nói chuyện không tự tin, không lưu loát, chưa có kinh nghiệm đi dạy…); hoặc Bên B dạy 1–2 buổi đầu mà PH/HV báo nghỉ do phương pháp dạy không phù hợp.',
  ],
  [
    'Mức 3',
    '50%',
    'Bên B dạy 1–2 buổi đầu mà PH/HV báo nghỉ dạy và phản hồi không tốt về tác phong, kỹ năng, chuyên môn, kiến thức… của Bên B.',
  ],
  [
    'Mức 4',
    '0%',
    'Bên B vi phạm nghĩa vụ tại Khoản 2 Điều 3 và hành vi vi phạm là nguyên nhân trực tiếp dẫn đến việc PH/HV từ chối, hủy hoặc chấm dứt lớp.',
  ],
];

/** "Hợp đồng nhận lớp dạy gia sư" — the centre's rules for taking classes, as provided. */
const ARTICLES: Article[] = [
  {
    title: 'ĐIỀU 1. PHẠM VI VÀ HIỆU LỰC ÁP DỤNG',
    blocks: [
      p(
        '1.1. Hợp đồng này là hợp đồng nguyên tắc, áp dụng chung cho tất cả các lớp mà Bên B nhận thông qua Bên A kể từ ngày ký. Bên B chỉ cần ký Hợp đồng này một lần và không phải ký lại cho mỗi lần nhận lớp tiếp theo.',
      ),
      p(
        '1.2. Bên A đồng ý giới thiệu và hỗ trợ kết nối Bên B với phụ huynh/học viên (gọi tắt là PH/HV) có nhu cầu học tập; Bên B đồng ý nhận lớp và giảng dạy theo nội quy, quy định của Bên A.',
      ),
      p(
        '1.3. Thông tin riêng của từng lớp (mã lớp, môn học, khối lớp, hình thức dạy, địa điểm, số buổi, thời lượng, học phí, phí nhận lớp, thông tin PH/HV) do Bên A cung cấp và Bên B xác nhận trước mỗi lần nhận lớp bằng “Phiếu xác nhận nhận lớp” (mẫu tại Phụ lục 01) hoặc xác nhận nhận lớp trên hệ thống của Bên A. Phiếu xác nhận từng lớp là phụ lục không tách rời của Hợp đồng này.',
      ),
      p(
        '1.4. Thông tin nhu cầu học trong từng lớp là thông tin PH/HV đã cung cấp và xác nhận với Bên A.',
      ),
    ],
  },
  {
    title: 'ĐIỀU 2. PHÍ NHẬN LỚP',
    blocks: [
      p(
        '2.1. Phí dịch vụ nhận lớp chỉ thu một lần đối với mỗi lớp. Mức phí cụ thể tùy thuộc vào từng lớp, được Bên A thông báo và Bên B xác nhận trước khi nhận lớp (ghi trong Phiếu xác nhận nhận lớp của lớp đó).',
      ),
      p(
        '2.2. Hình thức thanh toán phí nhận lớp của từng lớp (chuyển khoản hoặc tiền mặt tại Trung tâm) được ghi trong Phiếu xác nhận nhận lớp.',
      ),
      p(
        '2.3. Bên A có hỗ trợ Bên B nợ phí khi qua trực tiếp Trung tâm nhận lớp và trong thời hạn tối đa 15 ngày (tính theo từng lớp). Bên B có trách nhiệm thanh toán đúng thời hạn và cung cấp giấy tờ cần thiết theo yêu cầu của Bên A. Số tiền nợ và hạn thanh toán của từng lớp được ghi trong Phiếu xác nhận nhận lớp.',
      ),
    ],
  },
  {
    title: 'ĐIỀU 3. TRÁCH NHIỆM CỦA MỖI BÊN',
    blocks: [
      sub('3.1. Trách nhiệm của Bên A'),
      item(
        'Liên hệ với PH/HV để giới thiệu thông tin cơ bản của Bên B như: bằng cấp, thẻ sinh viên, giấy khen, kinh nghiệm… và hỗ trợ Bên B kết nối với PH/HV.',
      ),
      item(
        'Cung cấp đầy đủ, chính xác cho Bên B thông tin về nhu cầu học theo nội dung PH/HV đã cung cấp và xác nhận với Bên A.',
      ),
      item(
        'Hỗ trợ, hướng dẫn và giải đáp cho Bên B các vấn đề liên quan đến quá trình nhận lớp, giảng dạy và xử lý các tình huống phát sinh trong phạm vi trách nhiệm của Bên A.',
      ),
      item(
        'Bảo hành lớp cho Bên B trong thời hạn 45 ngày kể từ ngày nhận lớp theo quy định tại Điều 4 và Điều 5 của Hợp đồng này.',
      ),
      sub('3.2. Trách nhiệm của Bên B'),
      sub('a) Về hồ sơ, năng lực:'),
      item(
        'Chịu trách nhiệm về tính chính xác, trung thực và hợp pháp của thông tin cá nhân, bằng cấp, thẻ sinh viên, thẻ giáo viên và các giấy tờ liên quan đã cung cấp cho Bên A.',
      ),
      item(
        'Đồng ý để Bên A sử dụng và cung cấp cho PH/HV các thông tin, hình ảnh và giấy tờ thuộc hồ sơ gia sư của Bên B trong phạm vi cần thiết nhằm mục đích giới thiệu, kết nối lớp và xác minh thông tin, năng lực của Bên B.',
      ),
      item(
        'Chịu trách nhiệm về kiến thức, chuyên môn, tác phong và kỹ năng giảng dạy; đồng thời đảm bảo đủ năng lực, thời gian và sức khỏe để thực hiện việc giảng dạy trước khi quyết định nhận lớp.',
      ),
      item(
        'Xuất trình giấy tờ tùy thân, bằng cấp và các giấy tờ liên quan khi đến gặp PH/HV, đồng thời chịu trách nhiệm về tính chính xác, hợp pháp của các giấy tờ đó. Trường hợp Bên B không xuất trình được giấy tờ cần thiết dẫn đến PH/HV từ chối nhận gia sư thì Bên B tự chịu trách nhiệm và Bên A không có trách nhiệm bảo hành hoặc hoàn phí.',
      ),
      sub('b) Về bảo mật thông tin:'),
      item(
        'Bảo mật toàn bộ thông tin về PH/HV do Bên A cung cấp và không được tiết lộ, chuyển giao hoặc cung cấp các thông tin này cho bên thứ ba khi chưa có sự đồng ý của Bên A.',
      ),
      sub('c) Về liên hệ và thông báo:'),
      item(
        'Sau khi nhận thông tin PH/HV, Bên B phải liên hệ trong vòng 04 giờ và chủ động hẹn lịch sớm nhất. Trường hợp Bên B chậm liên hệ hoặc không thực hiện lịch đã hẹn dẫn đến hỏng lớp, Bên A không có trách nhiệm bảo hành hoặc hoàn phí. Trường hợp bất khả kháng, Bên B phải thông báo ngay cho Bên A để được theo dõi và hỗ trợ kịp thời.',
      ),
      item(
        'Trong quá trình nhận lớp, nếu phát sinh bất kỳ nội dung nào khác với thông tin hoặc thỏa thuận ban đầu giữa Bên A và PH/HV, Bên B có trách nhiệm thông báo cho Bên A trong vòng 12 giờ kể từ thời điểm phát hiện để Bên A kịp thời xác minh và giải quyết.',
      ),
      sub('d) Về giảng dạy và buổi dạy thử:'),
      item(
        'Chờ PH/HV sắp xếp buổi học đầu tiên trong thời hạn tối đa 15 ngày kể từ ngày nhận lớp và thực hiện 01 buổi dạy thử miễn phí để PH/HV đánh giá chất lượng giảng dạy.',
      ),
      item(
        'Trường hợp PH/HV giảm số buổi hoặc thời lượng học, Bên B tiếp tục giảng dạy và phối hợp sắp xếp lịch phù hợp; Bên A tính lại phí dịch vụ nhận lớp theo số buổi và thời lượng dạy thực tế theo quy định tại Điều 5.',
      ),
      item(
        'Bên B không được đổi người dạy, không hủy lớp, không tăng hoặc giảm số buổi học, không tăng hoặc giảm học phí, không tăng hoặc giảm thời lượng dạy, không ứng trước học phí hoặc không tạo thỏa thuận khác với PH/HV khi chưa có sự đồng ý của Bên A.',
      ),
      item(
        'Tất cả các vấn đề phát sinh hoặc thỏa thuận riêng giữa Bên B và PH/HV không liên quan đến nội dung dạy và học đã được Bên A – PH/HV – Bên B thống nhất ban đầu thì Bên A không có trách nhiệm can thiệp, giải quyết hoặc chịu trách nhiệm đối với các vấn đề, thỏa thuận đó.',
      ),
      sub('e) Về học phí và đạo đức nghề nghiệp:'),
      item(
        'Bên B nhận học phí trực tiếp từ PH/HV sau mỗi tháng giảng dạy. Bên B có trách nhiệm chủ động nhắc PH/HV thanh toán học phí đúng hạn và không để học phí tồn đọng quá 01 tháng. Bên A hỗ trợ Bên B liên hệ PH/HV thanh toán học phí khi cần thiết nhưng không chịu trách nhiệm đối với khoản học phí Bên B tự để tồn đọng quá 01 tháng.',
      ),
      item(
        'Trong quá trình nhận lớp và giảng dạy, nếu Bên B có hành vi vi phạm đạo đức, trộm cắp, xâm hại đến quyền, lợi ích hợp pháp hoặc tài sản của Bên A, PH/HV và gia đình PH/HV, hoặc có hành vi vi phạm pháp luật khác thì Bên B tự chịu trách nhiệm về hành vi của mình theo quy định của pháp luật hiện hành.',
      ),
    ],
  },
  {
    title: 'ĐIỀU 4. BẢO HÀNH LỚP',
    blocks: [
      p(
        '4.1. Bên A bảo hành từng lớp cho Bên B trong thời hạn 45 ngày kể từ ngày nhận lớp đó. Trong thời hạn bảo hành, trường hợp lớp bị gián đoạn hoặc chấm dứt từ phía PH/HV mà không xuất phát từ lỗi hoặc vi phạm của Bên B, Bên A sẽ xác minh và giải quyết theo quy định tại Điều 5.',
      ),
      p('4.2. Hết thời hạn 45 ngày của lớp nào, chính sách bảo hành đối với lớp đó chấm dứt.'),
    ],
  },
  {
    title: 'ĐIỀU 5. QUY ĐỊNH VỀ MỨC HOÀN PHÍ KHI LỚP DẠY GẶP TRỞ NGẠI',
    blocks: [
      p('5.1. Các mức hoàn phí nhận lớp cho Bên B, áp dụng riêng cho từng lớp:'),
      { kind: 'refunds' },
      p(
        '5.2. Các lý do khác phát sinh từ phía PH/HV như thay đổi nhu cầu học hoặc chấm dứt lớp trong thời hạn bảo hành 45 ngày, không xuất phát từ lỗi hoặc vi phạm của Bên B và không thuộc các trường hợp quy định tại Bảng 5.1, Bên A xác minh và xử lý như sau:',
      ),
      item(
        'Sau 01 buổi dạy thử, nếu PH/HV báo nghỉ không học nữa và có hỗ trợ học phí buổi dạy thử cho Bên B, phí dịch vụ được tính lại bằng 50% số tiền thực nhận Bên B đã nhận được từ PH/HV. Bên A hoàn lại phần chênh lệch giữa phí Bên B đã đóng và phí dịch vụ được tính lại.',
      ),
      item(
        'Sau 01 buổi dạy thử, nếu PH/HV đồng ý tiếp tục học nhưng thời gian học thực tế dưới 45 ngày kể từ ngày Bên B nhận lớp, phí dịch vụ được tính lại bằng 25% tổng số tiền thực nhận Bên B đã nhận từ PH/HV. Bên A hoàn lại phần chênh lệch giữa phí Bên B đã đóng và phí dịch vụ được tính lại.',
      ),
      item(
        'Trường hợp PH/HV thay đổi nhu cầu học, bao gồm giảm số buổi học/tuần hoặc giảm thời lượng học/buổi so với thỏa thuận ban đầu, Bên A tính lại phí dịch vụ nhận lớp tương ứng với số buổi và thời lượng dạy thực tế của Bên B. Phần phí chênh lệch (nếu có) được hoàn lại cho Bên B.',
      ),
      p(
        '5.3. Bên A thực hiện xác minh với PH/HV và xử lý hoàn phí trong thời hạn tối đa 10 ngày kể từ ngày nhận được yêu cầu của Bên B. Trong thời gian chờ xử lý, Bên B có thể lựa chọn lớp mới phù hợp để đổi lớp hoặc yêu cầu hoàn phí nếu không có nhu cầu nhận lớp khác.',
      ),
      p(
        '5.4. Việc xử lý lớp hỏng và hoàn phí được thực hiện vào thứ 4 và thứ 7 hàng tuần trong giờ hành chính theo lịch hẹn trước.',
      ),
    ],
  },
  {
    title: 'ĐIỀU 6. GIẢI QUYẾT TRANH CHẤP',
    blocks: [
      p(
        'Mọi tranh chấp phát sinh từ Hợp đồng này, hai bên ưu tiên giải quyết thông qua thương lượng, hòa giải trên tinh thần hợp tác. Trường hợp không thương lượng được, tranh chấp được giải quyết tại Tòa án có thẩm quyền theo quy định của pháp luật hiện hành.',
      ),
    ],
  },
  {
    title: 'ĐIỀU 7. HIỆU LỰC VÀ ĐIỀU KHOẢN CHUNG',
    blocks: [
      p(
        '7.1. Hai bên cam kết thực hiện đúng các nội quy, quy định đã nêu trên. Nếu bên nào vi phạm thì phải chịu hoàn toàn trách nhiệm về hành vi của mình.',
      ),
      p(
        '7.2. Bên B xác nhận đã đọc, hiểu rõ và đồng ý với toàn bộ nội dung của Hợp đồng này trước khi ký. Mỗi lần Bên B xác nhận nhận lớp (bằng Phiếu xác nhận hoặc trên hệ thống), Bên B được xem là tiếp tục chấp thuận nội dung Hợp đồng này đối với lớp đó.',
      ),
      p(
        '7.3. Hợp đồng có hiệu lực kể từ ngày ký và áp dụng cho mọi lớp Bên B nhận sau ngày ký, cho đến khi một bên thông báo chấm dứt bằng văn bản cho bên kia trước ít nhất 15 ngày. Việc chấm dứt Hợp đồng không ảnh hưởng đến quyền và nghĩa vụ của hai bên đối với các lớp đã nhận trước ngày chấm dứt (kể cả bảo hành, hoàn phí, nợ phí).',
      ),
      p(
        '7.4. Bên A có quyền cập nhật nội quy, quy định (bao gồm mức hoàn phí). Nội dung cập nhật được thông báo cho Bên B trước ít nhất 15 ngày và chỉ áp dụng cho các lớp nhận sau ngày có hiệu lực của nội dung cập nhật; Bên B không đồng ý có quyền chấm dứt Hợp đồng theo Khoản 7.3.',
      ),
      p(
        '7.5. Hợp đồng được lập thành 02 (hai) bản có giá trị pháp lý như nhau, mỗi bên giữ 01 (một) bản.',
      ),
    ],
  },
];

const DOTS = '………………………………………………………………………………………………………………';

/** A value, or a dotted blank to fill in by hand. */
function Fill({ value, min = '8rem' }: { value?: string | null | undefined; min?: string }) {
  if (value) return <span className="font-semibold">{value}</span>;
  return (
    <span
      aria-label="Để trống"
      style={{ minWidth: min }}
      className="inline-block w-0 min-w-0 flex-1 overflow-hidden align-bottom whitespace-nowrap"
    >
      {DOTS}
    </span>
  );
}

/** "Label: value" pairs laid out on one line. */
function Row({ children }: { children: ReactNode }) {
  return <p className="flex flex-wrap items-baseline gap-x-4">{children}</p>;
}

function Field({
  label,
  value,
  min,
}: {
  label: string;
  value?: string | null | undefined;
  min?: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1">
      <span className="shrink-0">{label}:</span>
      <Fill value={value} min={min} />
    </span>
  );
}

/** "dd / mm / yyyy", or the dotted date of the form. */
function dateParts(iso: string | null | undefined): string {
  const [year, month, day] = (iso ?? '').slice(0, 10).split('-');
  return year && month && day ? `${day} / ${month} / ${year}` : '……… / ……… / ………';
}

function Check({ on }: { on: boolean }) {
  return <span aria-label={on ? 'Đã chọn' : 'Chưa chọn'}>{on ? '☑' : '☐'}</span>;
}

const SHEET: CSSProperties = {
  fontFamily: '"Times New Roman", Times, "Liberation Serif", serif',
  backgroundColor: '#ffffff',
  color: '#000000',
};

function ArticleBody({ article }: { article: Article }) {
  return (
    <section>
      <h3 className="font-bold">{article.title}</h3>
      {article.blocks.map((block, index) =>
        block.kind === 'refunds' ? (
          <table key="refunds" className="my-2 w-full border-collapse text-[12pt]">
            <caption className="sr-only">Bảng 5.1. Các mức hoàn phí nhận lớp</caption>
            <thead>
              <tr>
                {['Mức', 'Tỷ lệ hoàn', 'Trường hợp áp dụng'].map((head) => (
                  <th key={head} scope="col" className="border border-black px-2 py-1 font-bold">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REFUNDS.map(([level, rate, cases]) => (
                <tr key={level} className="break-inside-avoid">
                  <th
                    scope="row"
                    className="border border-black px-2 py-1 align-top font-bold whitespace-nowrap"
                  >
                    {level}
                  </th>
                  <td className="border border-black px-2 py-1 text-center align-top font-bold">
                    {rate}
                  </td>
                  <td className="border border-black px-2 py-1 text-justify align-top">{cases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : block.kind === 'sub' ? (
          <p key={index} className="mt-1 font-bold italic">
            {block.text}
          </p>
        ) : block.kind === 'item' ? (
          <p key={index} className="flex gap-2 pl-[8mm] text-justify">
            <span aria-hidden="true">–</span>
            <span>{block.text}</span>
          </p>
        ) : (
          <p key={index} className="text-justify">
            {block.text}
          </p>
        ),
      )}
    </section>
  );
}

/** Facts of a signed class contract, shown on the sheet and in "Phụ lục 01". */
/** One class taken under the contract: a row of "Phụ lục 01 – Phiếu xác nhận nhận lớp". */
export interface ClassConfirmation {
  classCode: string;
  feeOptionTitle: string;
  agreedTuitionPerSessionMinor: number | null;
  placementFeeAmountMinor: number | null;
  placementFeePaidAt: string | null;
  /** When the tutor confirmed taking this class (contract acknowledged for it). */
  confirmedAt: string | null;
}

/** The tutor's single signed contract ("ký một lần", Điều 1.1) and the classes under it. */
export interface SignedContract {
  number: string;
  /** Date written in "Hôm nay, ngày …": the tutor's signature, else the issue date. */
  signedAt: string;
  issuedAt: string;
  acknowledgedAt: string | null;
  classes: ClassConfirmation[];
  /** Classes beyond the listed ones (older than the latest page). */
  moreClasses: number;
}

function dayText(iso: string): string {
  const [year, month, day] = formatDateKey(iso).split('-');
  return `ngày ${day} tháng ${month} năm ${year}`;
}

/** yyyy-mm-dd in the centre's time zone. */
function formatDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
}

function dateTime(iso: string): string {
  const [year, month, day] = formatDateKey(iso).split('-');
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
  return `${day}/${month}/${year} ${time}`;
}

/** Electronic signature of one party: who confirmed on the system, and when. */
function SignatureMark({ title, at, by }: { title: string; at: string; by: string }) {
  return (
    <div className="my-3 flex min-h-28 flex-1 flex-col items-center justify-center">
      <div className="rounded border-2 border-double border-black px-4 py-2 text-[11pt] leading-snug">
        <p className="font-bold uppercase">✓ {title}</p>
        <p className="font-semibold">{by}</p>
        <p className="italic">{dateTime(at)}</p>
      </div>
    </div>
  );
}

/** "Phụ lục 01 – Phiếu xác nhận nhận lớp": every class taken under this one contract. */
function ClassAppendix({ signed }: { signed: SignedContract }) {
  const money = (minor: number | null) =>
    minor === null ? 'Chưa ghi nhận' : `${minor.toLocaleString('vi-VN')} đ`;
  return (
    <section aria-label="Phụ lục 01" className="mt-6">
      <h3 className="text-center font-bold uppercase">Phụ lục 01 – Phiếu xác nhận nhận lớp</h3>
      <p className="text-center text-[11.5pt] italic">
        (Phụ lục không tách rời của Hợp đồng; mỗi lớp nhận theo Hợp đồng này là một dòng)
      </p>
      <table className="mt-2 w-full border-collapse text-[11pt]">
        <thead>
          <tr>
            {[
              'STT',
              'Mã lớp',
              'Học phí/buổi',
              'Phí nhận lớp',
              'Thanh toán phí',
              'Xác nhận nhận lớp',
            ].map((head) => (
              <th key={head} scope="col" className="border border-black px-1.5 py-1 font-bold">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signed.classes.map((item, index) => (
            <tr key={item.classCode} className="break-inside-avoid">
              <td className="border border-black px-1.5 py-1 text-center">{index + 1}</td>
              <th scope="row" className="border border-black px-1.5 py-1 text-left font-semibold">
                {item.classCode}
              </th>
              <td className="border border-black px-1.5 py-1 text-right">
                {money(item.agreedTuitionPerSessionMinor)}
              </td>
              <td className="border border-black px-1.5 py-1 text-right">
                {money(item.placementFeeAmountMinor)}
              </td>
              <td className="border border-black px-1.5 py-1 text-center">
                {item.placementFeePaidAt ? dateTime(item.placementFeePaidAt) : 'Chưa thanh toán'}
              </td>
              <td className="border border-black px-1.5 py-1 text-center">
                {item.confirmedAt ? dateTime(item.confirmedAt) : 'Chờ xác nhận'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {signed.moreClasses > 0 && (
        <p className="mt-1 text-[11pt] italic">… và {signed.moreClasses} lớp nhận trước đó.</p>
      )}
    </section>
  );
}

/**
 * The A4 "Hợp đồng nhận lớp dạy gia sư". Without `signed` it is the blank template; with it the
 * tutor's one contract: number, date, centre contacts, "Phụ lục 01" listing every class taken
 * and both parties' system confirmations. Bên B always comes from the tutor's own profile.
 */
export function ContractSheet({
  tutor,
  signed,
}: {
  tutor: TutorProfile | null;
  signed?: SignedContract;
}) {
  const teacher = tutor?.tutorType === 'teacher';
  const student =
    tutor?.tutorType === 'university_student' || tutor?.tutorType === 'pedagogy_student';
  return (
    <article
      aria-label="Hợp đồng nhận lớp dạy gia sư"
      style={SHEET}
      className="mx-auto box-border min-h-[297mm] w-[210mm] max-w-none px-[20mm] py-[18mm] text-[13pt] leading-[1.5] shadow-card print:min-h-0 print:w-auto print:p-0 print:shadow-none"
    >
      <header className="text-center font-bold">
        <p className="uppercase">Cộng hòa xã hội chủ nghĩa Việt Nam</p>
        <p>Độc lập – Tự do – Hạnh phúc</p>
        <p aria-hidden="true">————— * —————</p>
      </header>

      <div className="mt-6 text-center">
        <h2 className="text-[16pt] font-bold uppercase">Hợp đồng nhận lớp dạy gia sư</h2>
        <p className="italic">(Nội quy, quy định nhận lớp tại {CENTRE})</p>
        <p className="mt-1">Số: {signed ? `${signed.number} /HĐNT-ĐH` : '………… /HĐNT-ĐH'}</p>
      </div>

      <p className="mt-5 text-justify">
        Hôm nay, {signed ? dayText(signed.signedAt) : 'ngày ……… tháng ……… năm ………'}, tại {CENTRE},
        chúng tôi gồm:
      </p>

      <section aria-label="Bên A" className="mt-3 flex flex-col gap-0.5">
        <h3 className="font-bold uppercase">Bên A: Trung tâm Gia sư Sư phạm Đỗ Hằng</h3>
        <p className="text-justify">Địa chỉ duy nhất: {CENTRE_ADDRESS}</p>
        <Row>
          <Field label="Người đại diện: Bà" min="12rem" />
          <Field label="Chức vụ" min="8rem" />
        </Row>
        <Row>
          <Field label="Điện thoại" value={signed ? CENTRE_PHONE : null} min="10rem" />
          <Field label="Email" value={signed ? CENTRE_EMAIL : null} min="10rem" />
        </Row>
      </section>

      <section aria-label="Bên B" className="mt-3 flex flex-col gap-0.5">
        <h3 className="font-bold uppercase">Bên B: Gia sư nhận lớp</h3>
        <Row>
          <Field label="Họ và tên" value={tutor?.displayName} min="14rem" />
          <span className="shrink-0">Ngày sinh: {dateParts(tutor?.dateOfBirth)}</span>
        </Row>
        <Row>
          <Field label="Số CCCD" value={tutor?.idNumber} min="9rem" />
          <span className="shrink-0">Ngày cấp: {dateParts(tutor?.idIssuedOn)}</span>
          <Field label="Nơi cấp" min="6rem" />
        </Row>
        <Row>
          <Field label="Nơi thường trú" value={tutor?.idResidence} min="20rem" />
        </Row>
        <Row>
          <Field label="Điện thoại" value={tutor?.phone} min="10rem" />
          <Field label="Email" value={tutor?.email} min="10rem" />
        </Row>
        <div className="grid grid-cols-[auto_1fr] gap-x-3">
          <span>Đối tượng:</span>
          <span className="flex min-w-0 items-baseline gap-1">
            <Check on={student} />
            <span className="shrink-0">Sinh viên (Trường:</span>
            <Fill value={student ? tutor?.school : null} min="4rem" />
            <span className="shrink-0">)</span>
          </span>
          <span />
          <span className="flex min-w-0 items-baseline gap-1">
            <Check on={teacher} />
            <span className="shrink-0">Giáo viên (Nơi công tác:</span>
            <Fill value={teacher ? tutor?.school : null} min="4rem" />
            <span className="shrink-0">)</span>
          </span>
        </div>
      </section>

      <p className="mt-4 text-justify">
        Hai bên thống nhất ký kết Hợp đồng nguyên tắc nhận lớp dạy gia sư (sau đây gọi là “Hợp
        đồng”) với các điều khoản như sau:
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {ARTICLES.map((article) => (
          <ArticleBody key={article.title} article={article} />
        ))}
      </div>

      {signed && <ClassAppendix signed={signed} />}

      <footer className="mt-10 grid grid-cols-2 gap-6 text-center break-inside-avoid [&>div]:flex [&>div]:flex-col">
        <div>
          <p className="font-bold uppercase">Đại diện Bên A</p>
          <p className="text-[11.5pt] italic">(Ký, ghi rõ họ tên, đóng dấu)</p>
          {signed ? (
            <SignatureMark
              title="Đã phát hành trên hệ thống"
              at={signed.issuedAt}
              by="Trung tâm Gia sư Sư phạm Đỗ Hằng"
            />
          ) : (
            <div className="min-h-28 flex-1" />
          )}
          <p>Họ tên: ……………………………</p>
        </div>
        <div>
          <p className="font-bold uppercase">Bên B</p>
          <p className="text-[11.5pt] whitespace-nowrap italic">
            (Ký, ghi rõ họ tên hoặc xác nhận trên hệ thống)
          </p>
          {signed?.acknowledgedAt ? (
            <SignatureMark
              title="Đã ký xác nhận trên hệ thống"
              at={signed.acknowledgedAt}
              by={tutor?.displayName ?? 'Gia sư'}
            />
          ) : (
            <div className="min-h-28 flex-1" />
          )}
          <p>
            Họ tên:{' '}
            {tutor?.displayName ? (
              <span className="font-semibold">{tutor.displayName}</span>
            ) : (
              '……………………………'
            )}
          </p>
        </div>
      </footer>
    </article>
  );
}

/** "Hợp đồng mẫu" for tutors: the blank contract, Bên B filled from the tutor's own profile. */
export function TutorContractTemplatePage() {
  const profile = useOwnProfile();
  if (profile.isPending) return <PageLoading label="Đang tải hợp đồng mẫu…" />;
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
        <ContractSheet tutor={profile.data ?? null} />
      </div>
    </section>
  );
}
