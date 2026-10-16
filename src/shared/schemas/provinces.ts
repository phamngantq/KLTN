/**
 * Province-level units in force from 2025-07-01 (Nghị quyết 202/2025/QH15): 6 centrally
 * run cities, then 28 provinces. Tutors pick from these as teaching areas.
 */
export const VN_PROVINCES = [
  'Hà Nội',
  'Thành phố Hồ Chí Minh',
  'Hải Phòng',
  'Đà Nẵng',
  'Huế',
  'Cần Thơ',
  'Tuyên Quang',
  'Cao Bằng',
  'Lai Châu',
  'Lào Cai',
  'Thái Nguyên',
  'Điện Biên',
  'Lạng Sơn',
  'Sơn La',
  'Phú Thọ',
  'Bắc Ninh',
  'Quảng Ninh',
  'Hưng Yên',
  'Ninh Bình',
  'Thanh Hóa',
  'Nghệ An',
  'Hà Tĩnh',
  'Quảng Trị',
  'Quảng Ngãi',
  'Gia Lai',
  'Khánh Hòa',
  'Lâm Đồng',
  'Đắk Lắk',
  'Đồng Nai',
  'Tây Ninh',
  'Vĩnh Long',
  'Đồng Tháp',
  'An Giang',
  'Cà Mau',
] as const;

export type VnProvince = (typeof VN_PROVINCES)[number];

export function isProvince(value: string): value is VnProvince {
  return (VN_PROVINCES as readonly string[]).includes(value);
}

/** "Phường Cầu Giấy, Hà Nội" → "Hà Nội"; a bare province name returns itself. */
export function provinceOfArea(area: string): VnProvince | null {
  const last = area.split(',').at(-1)?.trim() ?? '';
  return isProvince(last) ? last : null;
}
