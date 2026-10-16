import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Trash2, X } from 'lucide-react';
import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_TYPES } from '../../../shared/schemas/tutors';
import { Button } from '../../components/ui/Button';
import { OWN_PROFILE_KEY } from '../../features/tutor-profile/api';
import { api } from '../../lib/api-client';

/** Square, at most 512 px JPEG so phone photos fit the 1 MB limit; small files pass through. */
async function prepareAvatar(file: File): Promise<File> {
  if (!(PROFILE_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
  }
  if (typeof createImageBitmap !== 'function') {
    if (file.size > PROFILE_PHOTO_MAX_BYTES) throw new Error('Ảnh đại diện tối đa 1 MB.');
    return file;
  }
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const size = Math.min(512, side);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas
    .getContext('2d')
    ?.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob || blob.size > PROFILE_PHOTO_MAX_BYTES) throw new Error('Ảnh đại diện tối đa 1 MB.');
  return new File([blob], 'anh-dai-dien.jpg', { type: 'image/jpeg' });
}

export function ProfilePhotoField({
  hasPhoto,
  displayName,
}: {
  hasPhoto: boolean;
  displayName: string;
}) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  // A chosen photo is previewed first and uploaded only on "Cập nhật ảnh".
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null);
  useEffect(
    () => () => {
      if (pending?.url) URL.revokeObjectURL(pending.url);
    },
    [pending],
  );
  const refresh = () => {
    setVersion((value) => value + 1);
    setPending(null);
    void queryClient.invalidateQueries({ queryKey: OWN_PROFILE_KEY });
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set('file', file);
      return api.upload('/tutor/profile/photo', form);
    },
    onSuccess: refresh,
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Chưa tải được ảnh.'),
  });

  async function choose(file: File) {
    setError('');
    try {
      const prepared = await prepareAvatar(file);
      setPending({
        file: prepared,
        url: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(prepared) : '',
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa đọc được ảnh.');
    }
  }
  const remove = useMutation({
    mutationFn: () => api.delete('/tutor/profile/photo'),
    onSuccess: refresh,
  });
  const initials =
    displayName
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || 'GS';

  return (
    <div className="flex flex-wrap items-center gap-4">
      {pending ? (
        <img
          src={pending.url}
          alt="Ảnh đại diện xem trước"
          className="size-20 rounded-full border-2 border-accent object-cover"
        />
      ) : hasPhoto ? (
        <img
          src={`/api/v1/tutor/profile/photo?v=${version}`}
          alt="Ảnh đại diện hiện tại"
          className="size-20 rounded-full border border-border object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-gradient-end text-2xl font-bold text-on-primary"
        >
          {initials}
        </span>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {pending && (
            <>
              <Button
                type="button"
                loading={upload.isPending}
                onClick={() => upload.mutate(pending.file)}
                className="gap-2"
              >
                <Check aria-hidden="true" className="size-4" />
                Cập nhật ảnh
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={upload.isPending}
                onClick={() => setPending(null)}
                className="gap-2"
              >
                <X aria-hidden="true" className="size-4" />
                Hủy
              </Button>
            </>
          )}
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-primary focus-within:outline-2 focus-within:outline-focus hover:bg-info-surface">
            <Camera aria-hidden="true" className="size-4" />
            {hasPhoto ? 'Đổi ảnh đại diện' : 'Tải ảnh đại diện'}
            <input
              type="file"
              accept={PROFILE_PHOTO_TYPES.join(',')}
              className="sr-only"
              disabled={upload.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void choose(file);
              }}
            />
          </label>
          {hasPhoto && !pending && (
            <Button
              type="button"
              variant="secondary"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
              className="gap-2"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Xóa ảnh
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">
          {pending && 'Đang xem trước ảnh mới — bấm “Cập nhật ảnh” để lưu. '}
          JPG, PNG hoặc WebP; ảnh được cắt vuông và thu nhỏ. Người học chỉ thấy ảnh khi bạn được đề
          xuất cho lớp của họ.
        </p>
        {(error || upload.isPending) && (
          <p
            role={error ? 'alert' : 'status'}
            className={`text-sm ${error ? 'text-danger' : 'text-muted'}`}
          >
            {error || 'Đang tải ảnh…'}
          </p>
        )}
      </div>
    </div>
  );
}
