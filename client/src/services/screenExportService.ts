import axios from 'axios';
import { apiClient } from '@/api/client';

export interface ScreenExportRequest {
  pathname: string;
  accessCode: string;
}

function decodeFilename(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function screenExportFilename(contentDisposition?: string) {
  if (!contentDisposition) return 'screen-export.zip';
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeFilename(encoded.trim().replace(/^"|"$/g, ''));
  const plain = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
  return plain?.trim() || 'screen-export.zip';
}

async function blobText(blob: Blob) {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read export error'));
    reader.readAsText(blob);
  });
}

export async function screenExportErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : 'Screen export failed. Please try again.';
  }
  const data = error.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await blobText(data)) as { message?: unknown };
      if (typeof parsed.message === 'string') return parsed.message;
    } catch {
      // The response was not a JSON error envelope.
    }
  }
  if (
    typeof data === 'object' &&
    data &&
    'message' in data &&
    typeof (data as { message?: unknown }).message === 'string'
  ) {
    return (data as { message: string }).message;
  }
  return error.message || 'Screen export failed. Please try again.';
}

export async function requestScreenExport(input: ScreenExportRequest, legacySessionToken?: string) {
  const response = await apiClient.post<Blob>('/screen-exports', input, {
    responseType: 'blob',
    timeout: 120_000,
    headers: {
      Accept: 'application/zip',
      ...(legacySessionToken ? { Authorization: `Bearer ${legacySessionToken}` } : {}),
    },
  });
  return {
    blob: response.data,
    filename: screenExportFilename(response.headers['content-disposition']),
  };
}

export function downloadScreenExport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
