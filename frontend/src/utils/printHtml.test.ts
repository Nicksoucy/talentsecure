import { describe, it, expect } from 'vitest';
import { printHtml } from './printHtml';

describe('printHtml', () => {
  it('charge la lettre dans une iframe invisible et ouvre l’impression', () => {
    printHtml('<p>Lettre</p>');
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.srcdoc).toBe('<p>Lettre</p>');
    expect(frame.getAttribute('aria-hidden')).toBe('true');

    let printed = false;
    Object.defineProperty(frame, 'contentWindow', {
      value: { focus: () => {}, print: () => { printed = true; }, addEventListener: () => {} },
    });
    frame.onload?.(new Event('load'));
    expect(printed).toBe(true);
    frame.remove();
  });
});
