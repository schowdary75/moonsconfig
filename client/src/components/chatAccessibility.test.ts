// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getChatFocusableElements,
  keepChatFocusInside,
  shouldSendChatMessage,
} from './chatAccessibility';

afterEach(() => {
  document.body.replaceChildren();
});

describe('chat dialog keyboard boundaries', () => {
  it('finds only operable controls in document order', () => {
    const dialog = document.createElement('div');
    dialog.innerHTML = `
      <button id="first">First</button>
      <button disabled>Disabled</button>
      <div aria-hidden="true"><button>Hidden</button></div>
      <textarea id="last"></textarea>
    `;
    document.body.append(dialog);

    expect(getChatFocusableElements(dialog).map((element) => element.id)).toEqual([
      'first',
      'last',
    ]);
  });

  it('wraps Tab and Shift+Tab at the dialog edges', () => {
    const dialog = document.createElement('div');
    dialog.tabIndex = -1;
    dialog.innerHTML = '<button id="first">First</button><button id="last">Last</button>';
    document.body.append(dialog);
    const first = dialog.querySelector<HTMLElement>('#first')!;
    const last = dialog.querySelector<HTMLElement>('#last')!;

    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    expect(keepChatFocusInside(tab, dialog)).toBe(true);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    const reverseTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    expect(keepChatFocusInside(reverseTab, dialog)).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('keeps an empty dialog focusable', () => {
    const dialog = document.createElement('div');
    dialog.tabIndex = -1;
    document.body.append(dialog);
    dialog.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    expect(keepChatFocusInside(event, dialog)).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(dialog);
  });

  it('moves from a programmatically focused heading into the dialog tab order', () => {
    const dialog = document.createElement('div');
    dialog.innerHTML =
      '<h2 id="heading" tabindex="-1">Support</h2><button id="first">First</button><button id="last">Last</button>';
    document.body.append(dialog);
    dialog.querySelector<HTMLElement>('#heading')!.focus();

    const forward = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    keepChatFocusInside(forward, dialog);
    expect(document.activeElement).toBe(dialog.querySelector('#first'));

    dialog.querySelector<HTMLElement>('#heading')!.focus();
    const reverse = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    });
    keepChatFocusInside(reverse, dialog);
    expect(document.activeElement).toBe(dialog.querySelector('#last'));
  });
});

describe('chat composer keyboard intent', () => {
  it('sends on Enter only', () => {
    expect(shouldSendChatMessage({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true);
    expect(shouldSendChatMessage({ key: 'a', shiftKey: false, isComposing: false })).toBe(false);
  });

  it('preserves Shift+Enter and IME composition', () => {
    expect(shouldSendChatMessage({ key: 'Enter', shiftKey: true, isComposing: false })).toBe(false);
    expect(shouldSendChatMessage({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false);
  });
});
