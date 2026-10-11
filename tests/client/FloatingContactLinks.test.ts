import { describe, expect, it } from 'vitest';
import { contactUrl } from '../../src/client/components/domain/FloatingContactLinks';

describe('public contact link configuration', () => {
  it('accepts only HTTPS links on the matching platform', () => {
    expect(contactUrl('https://www.facebook.com/', 'facebook')).toBe('https://www.facebook.com/');
    expect(contactUrl('https://zalo.me/0394618480', 'zalo')).toBe('https://zalo.me/0394618480');
    expect(contactUrl('javascript:alert(1)', 'facebook')).toBeNull();
    expect(contactUrl('https://facebook.com.evil.example/', 'facebook')).toBeNull();
    expect(contactUrl('https://zalo.me@evil.example/', 'zalo')).toBeNull();
    expect(contactUrl('https://facebook.com/', 'zalo')).toBeNull();
  });
});
