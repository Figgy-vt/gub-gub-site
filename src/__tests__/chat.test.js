/**
 * @jest-environment jsdom
 */

import { escapeHTML } from '../chat.js';

describe('escapeHTML', () => {
  it('escapes special characters', () => {
    const input = `<div>&"'</div>`;
    const output = escapeHTML(input);
    expect(output).toBe('&lt;div&gt;&amp;&quot;&#39;&lt;/div&gt;');
  });
});
