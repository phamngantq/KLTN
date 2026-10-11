import { Facebook, MessageCircle } from 'lucide-react';

type ContactPlatform = 'facebook' | 'zalo';

export function contactUrl(value: string | undefined, platform: ContactPlatform): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const allowed =
      platform === 'facebook'
        ? host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'm.me'
        : host === 'zalo.me' || host.endsWith('.zalo.me');
    return allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

export function FloatingContactLinks() {
  const facebook = contactUrl(import.meta.env.VITE_FACEBOOK_CONTACT_URL, 'facebook');
  const zalo = contactUrl(import.meta.env.VITE_ZALO_CONTACT_URL, 'zalo');
  if (!facebook && !zalo) return null;

  return (
    <nav
      aria-label="Liên hệ nhanh"
      className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-end gap-2 print:hidden sm:right-6 sm:bottom-6"
    >
      {facebook && (
        <a
          href={facebook}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Mở Facebook trong tab mới"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary shadow-lg ring-1 ring-white/20 transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Facebook aria-hidden="true" className="size-5" />
          Facebook
        </a>
      )}
      {zalo && (
        <a
          href={zalo}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Mở Zalo trong tab mới"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent shadow-lg ring-1 ring-primary/15 transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <MessageCircle aria-hidden="true" className="size-5" />
          Zalo
        </a>
      )}
    </nav>
  );
}
