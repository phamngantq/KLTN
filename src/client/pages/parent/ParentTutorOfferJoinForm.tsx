import { useState, type FormEvent } from 'react';
import { REQUEST_GRADE_OPTIONS } from '../../../shared/schemas/requests';
import type { PublicTutorOffer } from '../../../shared/schemas/tutor-offers';
import {
  TUTOR_OFFER_JOIN_CONTACT_CONSENT_TEXT,
  TUTOR_OFFER_JOIN_DETAILS_CONSENT_TEXT,
} from '../../../shared/schemas/tutor-offer-joins';
import { isReadOnlyPreview } from '../../app/preview';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { TextareaField, TextField } from '../../components/ui/Field';
import { PageLoading } from '../../components/ui/Spinner';
import {
  useLatestParentTutorOfferJoin,
  useParentTutorOfferJoinActions,
} from '../../features/tutor-offer-joins/api';
import { fieldErrors } from '../../lib/api-client';

export function ParentTutorOfferJoinForm({ offer }: { offer: PublicTutorOffer }) {
  const latest = useLatestParentTutorOfferJoin(offer.id);
  const [learningNeeds, setLearningNeeds] = useState('');
  const [teachingArea, setTeachingArea] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [detailsConsent, setDetailsConsent] = useState(false);
  const [contactConsent, setContactConsent] = useState(false);
  const [localError, setLocalError] = useState('');
  const { create } = useParentTutorOfferJoinActions();
  const errors = fieldErrors(create.error);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      create.isPending ||
      create.isSuccess ||
      latest.isPending ||
      latest.isError ||
      latest.data?.status === 'submitted' ||
      latest.data?.status === 'approved' ||
      isReadOnlyPreview()
    )
      return;
    const needs = learningNeeds.trim();
    const area = teachingArea.trim();
    if (!REQUEST_GRADE_OPTIONS.includes(offer.grade)) {
      setLocalError('Lớp học của học sinh không hợp lệ.');
      return;
    }
    if (needs.length < 20 || needs.length > 500) {
      setLocalError('Mô tả nhu cầu học tập từ 20 đến 500 ký tự.');
      return;
    }
    if ((offer.mode === 'offline' && area.length < 2) || area.length > 120) {
      setLocalError('Nhập khu vực chung từ 2 đến 120 ký tự cho lớp trực tiếp.');
      return;
    }
    if (area.length > 0 && area.length < 2) {
      setLocalError('Khu vực chung cần ít nhất 2 ký tự.');
      return;
    }
    if (!/^\+?[0-9]{8,15}$/.test(contactPhone.trim())) {
      setLocalError('Nhập số điện thoại gồm 8 đến 15 chữ số.');
      return;
    }
    if (!detailsConsent || !contactConsent) {
      setLocalError('Cần xác nhận riêng cả hai nội dung chia sẻ thông tin.');
      return;
    }
    setLocalError('');
    create.mutate({
      offerId: offer.id,
      offerVersion: offer.version,
      studentGrade: offer.grade,
      learningNeeds: needs,
      teachingArea: area || null,
      contactPhone: contactPhone.trim(),
      shareApplicationDetailsConsent: true,
      shareContactAfterApprovalConsent: true,
    });
  }

  if (create.isSuccess) {
    return (
      <Alert
        tone="success"
        title="Đã gửi yêu cầu tham gia lớp"
        action={
          <ButtonLink to="/parent/tutor-offer-joins" variant="secondary">
            Xem yêu cầu của tôi
          </ButtonLink>
        }
      >
        Yêu cầu đã được ghi nhận trên hệ thống.
      </Alert>
    );
  }

  if (latest.isPending) return <PageLoading label="Đang kiểm tra yêu cầu tham gia lớp của bạn…" />;
  if (latest.isError)
    return (
      <Alert
        tone="danger"
        title="Chưa thể kiểm tra yêu cầu hiện tại"
        action={
          <Button variant="secondary" onClick={() => void latest.refetch()}>
            Thử lại
          </Button>
        }
      >
        {latest.error.message}
      </Alert>
    );
  if (latest.data?.status === 'submitted' || latest.data?.status === 'approved') {
    return (
      <Alert
        tone="info"
        title={
          latest.data.status === 'approved'
            ? 'Yêu cầu của bạn đã được duyệt'
            : 'Yêu cầu của bạn đang chờ kiểm duyệt'
        }
        action={
          <ButtonLink
            to={`/parent/tutor-offer-joins/${encodeURIComponent(latest.data.id)}`}
            variant="secondary"
          >
            Xem yêu cầu của tôi
          </ButtonLink>
        }
      >
        Bạn đã gửi yêu cầu tham gia lớp này.
      </Alert>
    );
  }

  return (
    <section
      className="rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6"
      aria-labelledby="join-offer-title"
    >
      <h2 id="join-offer-title" className="text-lg font-semibold text-primary">
        Gửi yêu cầu tham gia lớp
      </h2>
      <p className="mt-2 text-sm text-muted">
        Thông tin học tập bạn nhập sẽ được gia sư đăng lớp và kiểm duyệt viên xem để xử lý yêu cầu.
      </p>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        <TextField
          label="Lớp học của học sinh"
          value={offer.grade}
          readOnly
          hint="Lớp học sinh cần phù hợp với lớp gia sư đã đăng."
          error={errors.studentGrade}
        />
        <TextareaField
          label="Nhu cầu học tập"
          value={learningNeeds}
          onChange={(event) => setLearningNeeds(event.target.value)}
          minLength={20}
          maxLength={500}
          required
          hint="Mô tả môn cần học, mục tiêu và nội dung mong muốn. Không nhập số điện thoại, email hoặc địa chỉ."
          error={errors.learningNeeds}
        />
        <TextField
          label="Khu vực học chung"
          value={teachingArea}
          onChange={(event) => setTeachingArea(event.target.value)}
          maxLength={120}
          required={offer.mode === 'offline'}
          hint={
            offer.mode === 'offline'
              ? 'Nhập quận/huyện hoặc khu vực chung; không nhập địa chỉ cụ thể.'
              : 'Tùy chọn khi học trực tuyến; không nhập thông tin liên hệ.'
          }
          error={errors.teachingArea}
        />
        <TextField
          label="Số điện thoại liên hệ riêng"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={contactPhone}
          onChange={(event) => setContactPhone(event.target.value)}
          required
          hint="Gia sư chỉ được xem số điện thoại sau khi kiểm duyệt viên duyệt yêu cầu và xác nhận học phí."
          error={errors.contactPhone}
        />
        <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
          <input
            type="checkbox"
            checked={detailsConsent}
            onChange={(event) => setDetailsConsent(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          {TUTOR_OFFER_JOIN_DETAILS_CONSENT_TEXT}
        </label>
        <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
          <input
            type="checkbox"
            checked={contactConsent}
            onChange={(event) => setContactConsent(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          {TUTOR_OFFER_JOIN_CONTACT_CONSENT_TEXT}
        </label>
        {localError && <Alert tone="danger">{localError}</Alert>}
        {create.isError && (
          <Alert tone="danger" title="Chưa gửi được yêu cầu">
            {create.error.message}
          </Alert>
        )}
        <Button
          type="submit"
          loading={create.isPending}
          disabled={!detailsConsent || !contactConsent || isReadOnlyPreview()}
        >
          Gửi yêu cầu tham gia lớp
        </Button>
      </form>
    </section>
  );
}
