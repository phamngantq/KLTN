import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/**
 * Draws a VietQR payload as an SVG QR code (error correction M, quiet zone of 4 modules).
 * The payload is built on the server from the real fee, transfer content and centre account.
 */
export function VietQrCode({ payload, label }: { payload: string; label: string }) {
  const { size, path } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(payload, 'Byte');
    code.make();
    const count = code.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (code.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
      }
    }
    return { size: count + 8, path: d };
  }, [payload]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-full rounded-lg bg-white"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
