import { useState } from 'react';
import { ClipboardCheck, FileText } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { PageLoading } from '../../components/ui/Spinner';
import { useAcceptTerms, useTutorTerms } from '../../features/terms-contracts/api';
import { formatDate } from '../../lib/format';

/** Only in-app tutor pages may be the return target after accepting. */
function safeNext(value: string | null): string | null {
  return value && /^\/tutor\/[^/]/.test(value) && !value.startsWith('//') ? value : null;
}

/**
 * "Điều khoản trách nhiệm": the tutor reads the published terms and accepts them with one
 * checkbox, once per published revision.
 */
export function TutorTermsPage() {
  const terms = useTutorTerms();
  const accept = useAcceptTerms();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const [agreed, setAgreed] = useState(false);
  const readOnly = isReadOnlyPreview();

  function confirm() {
    if (!terms.data || !agreed || readOnly) return;
    accept.mutate(terms.data.termsContentRevisionId, {
      onSuccess: () => {
        if (next) navigate(next);
      },
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold text-primary">Điều khoản trách nhiệm</h1>
        <p className="mt-2 text-muted">
          Đọc kỹ điều khoản trước khi nhận lớp. Chỉ cần xác nhận một lần cho mỗi phiên bản điều
          khoản.
        </p>
      </header>
      {terms.isPending ? (
        <PageLoading label="Đang tải điều khoản…" />
      ) : terms.isError ? (
        <Alert
          tone="warning"
          title="Chưa có điều khoản được công bố"
          action={
            <Button variant="secondary" onClick={() => void terms.refetch()}>
              Thử lại
            </Button>
          }
        >
          {terms.error.message}
        </Alert>
      ) : (
        <article className="overflow-hidden rounded-2xl border border-border bg-bg shadow-card">
          <h2 className="flex items-center gap-2 border-b border-border bg-surface px-6 py-4 text-lg font-semibold text-primary">
            <FileText aria-hidden="true" className="size-5" />
            {terms.data.termsTitle}
            <span className="text-sm font-normal text-muted">
              · Phiên bản {terms.data.termsRevision}
            </span>
          </h2>
          <div className="flex flex-col gap-5 px-6 py-6">
            <p className="max-h-[50vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed">
              {terms.data.termsBodyText}
            </p>
            {terms.data.acceptedAt ? (
              <Alert tone="success" title="Bạn đã xác nhận điều khoản">
                Đã đồng ý ngày {formatDate(terms.data.acceptedAt, 'Asia/Ho_Chi_Minh')}. Các lần nhận
                lớp sau không cần làm lại.
                {next && (
                  <ButtonLink to={next} className="mt-3 block w-fit">
                    Tiếp tục nhận lớp
                  </ButtonLink>
                )}
              </Alert>
            ) : (
              <>
                <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-4 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--color-primary)]"
                    checked={agreed}
                    onChange={(event) => setAgreed(event.target.checked)}
                  />
                  Tôi xác nhận đã đọc và đồng ý với Điều khoản trách nhiệm của trung tâm.
                </label>
                {accept.isError && (
                  <Alert tone="danger" title="Chưa ghi nhận được xác nhận">
                    {accept.error.message}
                  </Alert>
                )}
                <Button
                  onClick={confirm}
                  disabled={!agreed || readOnly}
                  loading={accept.isPending}
                  className="gap-2 self-start"
                >
                  <ClipboardCheck aria-hidden="true" className="size-4" />
                  Xác nhận
                </Button>
              </>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
