export const VISUAL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const VISUAL_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

const VISUAL_IMAGE_MIME_SET = new Set<string>(VISUAL_IMAGE_MIME_TYPES);

export type VisualImageValidation =
  { valid: true } | { valid: false; message: string; reason: 'type' | 'size' | 'empty' };

export function validateVisualImage(file: Pick<File, 'size' | 'type'>): VisualImageValidation {
  if (!VISUAL_IMAGE_MIME_SET.has(file.type)) {
    return {
      valid: false,
      reason: 'type',
      message: 'Choose a JPEG, PNG, WebP, or AVIF image.',
    };
  }
  if (file.size < 1) {
    return {
      valid: false,
      reason: 'empty',
      message: 'That image is empty. Choose another file.',
    };
  }
  if (file.size > VISUAL_IMAGE_MAX_BYTES) {
    return {
      valid: false,
      reason: 'size',
      message: 'Choose an image no larger than 10 MiB.',
    };
  }
  return { valid: true };
}

export function readVisualImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be read. Choose another file.'));
    reader.onabort = () => reject(new Error('Image reading was cancelled.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.includes(',')) {
        reject(new Error('The image could not be read. Choose another file.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
