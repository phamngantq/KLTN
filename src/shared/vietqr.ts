/**
 * VietQR (NAPAS 247 over EMVCo QR) payload for a bank transfer with a fixed amount and content.
 * Any Vietnamese banking app reads it; the image itself is drawn on the client.
 */

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as EMVCo field 63 requires. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Bank transfer content is ASCII only: accents dropped, other characters removed. */
export function transferText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

export function vietQrPayload(input: {
  bankBin: string;
  accountNumber: string;
  amountMinor: number;
  content: string;
}): string {
  const merchant = field(
    '38',
    field('00', 'A000000727') +
      field('01', field('00', input.bankBin) + field('01', input.accountNumber)) +
      field('02', 'QRIBFTTA'),
  );
  const body =
    field('00', '01') +
    field('01', '12') +
    merchant +
    field('53', '704') +
    field('54', String(input.amountMinor)) +
    field('58', 'VN') +
    field('62', field('08', transferText(input.content))) +
    '6304';
  return body + crc16(body);
}
