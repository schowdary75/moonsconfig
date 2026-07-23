// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisualImageDropzone } from './VisualImageDropzone';
import {
  validateVisualImage,
  VISUAL_IMAGE_MAX_BYTES,
  VISUAL_IMAGE_MIME_TYPES,
} from './visualImageUpload';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderDropzone(overrides: Partial<React.ComponentProps<typeof VisualImageDropzone>> = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const props: React.ComponentProps<typeof VisualImageDropzone> = {
    imageSrc: null,
    busy: false,
    dragActive: false,
    error: null,
    onDragActiveChange: vi.fn(),
    onFile: vi.fn(),
    ...overrides,
  };
  act(() => root!.render(<VisualImageDropzone {...props} />));
  return { container, props };
}

function dispatchDrop(element: Element, file: File) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { files: [file], dropEffect: 'none' },
  });
  act(() => element.dispatchEvent(event));
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('validateVisualImage', () => {
  it.each(VISUAL_IMAGE_MIME_TYPES)('accepts %s within the 10 MiB limit', (type) => {
    expect(validateVisualImage({ type, size: VISUAL_IMAGE_MAX_BYTES })).toEqual({ valid: true });
  });

  it('rejects unsupported, empty, and oversized files with useful messages', () => {
    expect(validateVisualImage({ type: 'image/gif', size: 10 })).toMatchObject({
      valid: false,
      reason: 'type',
    });
    expect(validateVisualImage({ type: 'image/png', size: 0 })).toMatchObject({
      valid: false,
      reason: 'empty',
    });
    expect(validateVisualImage({ type: 'image/png', size: VISUAL_IMAGE_MAX_BYTES + 1 })).toEqual({
      valid: false,
      reason: 'size',
      message: 'Choose an image no larger than 10 MiB.',
    });
  });
});

describe('VisualImageDropzone', () => {
  it('routes picker and drop input through the same callback', () => {
    const onFile = vi.fn();
    const { container } = renderDropzone({ onFile });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pickerFile = new File(['picker'], 'picker.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { configurable: true, value: [pickerFile] });
    act(() => input.dispatchEvent(new Event('change', { bubbles: true })));

    const dropFile = new File(['drop'], 'drop.webp', { type: 'image/webp' });
    dispatchDrop(container.querySelector('[role="button"]')!, dropFile);

    expect(onFile).toHaveBeenNthCalledWith(1, pickerFile);
    expect(onFile).toHaveBeenNthCalledWith(2, dropFile);
  });

  it('opens the picker with Enter and Space', () => {
    const { container } = renderDropzone();
    const dropzone = container.querySelector('[role="button"]')!;
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);

    act(() => {
      dropzone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      dropzone.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    expect(click).toHaveBeenCalledTimes(2);
  });

  it('shows the drag-active state until the drag leaves', () => {
    function Harness() {
      const [active, setActive] = useState(false);
      return (
        <VisualImageDropzone
          imageSrc={null}
          busy={false}
          dragActive={active}
          error={null}
          onDragActiveChange={setActive}
          onFile={vi.fn()}
        />
      );
    }

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<Harness />));
    const dropzone = container.querySelector('[role="button"]')!;

    act(() => dropzone.dispatchEvent(new Event('dragenter', { bubbles: true, cancelable: true })));
    expect(dropzone.getAttribute('data-drag-active')).toBe('true');
    expect(dropzone.textContent).toContain('Release to upload');

    act(() => dropzone.dispatchEvent(new Event('dragleave', { bubbles: true, cancelable: true })));
    expect(dropzone.getAttribute('data-drag-active')).toBe('false');
  });

  it('blocks keyboard and drop submissions while analysis is running', () => {
    const onFile = vi.fn();
    const { container } = renderDropzone({ busy: true, onFile });
    const dropzone = container.querySelector('[role="button"]')!;
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);

    act(() =>
      dropzone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    dispatchDrop(dropzone, new File(['busy'], 'busy.png', { type: 'image/png' }));

    expect(dropzone.getAttribute('aria-busy')).toBe('true');
    expect(dropzone.getAttribute('tabindex')).toBe('-1');
    expect(dropzone.textContent).toContain('Analysis is in progress');
    expect(click).not.toHaveBeenCalled();
    expect(onFile).not.toHaveBeenCalled();
  });

  it('announces validation and provider errors', () => {
    const { container } = renderDropzone({ error: 'Choose a JPEG, PNG, WebP, or AVIF image.' });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Choose a JPEG');
  });
});
