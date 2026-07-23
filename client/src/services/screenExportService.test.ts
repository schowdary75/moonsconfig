// @vitest-environment jsdom

import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadScreenExport,
  screenExportErrorMessage,
  screenExportFilename,
} from './screenExportService';

describe('screen export client helpers', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads ordinary and encoded ZIP filenames from Content-Disposition', () => {
    expect(screenExportFilename('attachment; filename="packages-detail.zip"')).toBe(
      'packages-detail.zip',
    );
    expect(screenExportFilename("attachment; filename*=UTF-8''crm%20clients.zip")).toBe(
      'crm clients.zip',
    );
    expect(screenExportFilename()).toBe('screen-export.zip');
  });

  it('extracts a server JSON message returned as a Blob', async () => {
    const error = new axios.AxiosError('Request failed');
    error.response = {
      data: new Blob([JSON.stringify({ message: 'Incorrect screen export access code' })], {
        type: 'application/json',
      }),
    } as any;
    expect(await screenExportErrorMessage(error)).toBe('Incorrect screen export access code');
  });

  it('downloads through a temporary object URL and revokes it', () => {
    const createObjectURL = vi.fn(() => 'blob:screen-export');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.useFakeTimers();

    downloadScreenExport(new Blob(['zip']), 'dashboard.zip');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:screen-export');
    vi.useRealTimers();
  });
});
