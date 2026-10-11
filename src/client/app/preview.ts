/** Public build flag; the Worker independently enforces the read-only boundary. */
export function isReadOnlyPreview(): boolean {
  return import.meta.env.VITE_PREVIEW_READ_ONLY === 'true';
}
