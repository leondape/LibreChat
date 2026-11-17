/** Hands the picture to the system share sheet, or downloads it when that is unavailable. */
export async function deliverImage(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const payload = { files: [file] };
  if (typeof navigator.canShare === 'function' && navigator.canShare(payload)) {
    await navigator.share(payload);
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
