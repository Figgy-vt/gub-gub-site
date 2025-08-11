/**
 * @jest-environment jsdom
 */

import { sanitizeUsername } from '../username.js';

describe('sanitizeUsername', () => {
  it('strips invalid characters and lowercases', () => {
    expect(sanitizeUsername('User!@#')).toBe('user');
  });

  it('limits username length to 20 chars', () => {
    const long = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(sanitizeUsername(long)).toBe('abcdefghijklmnopqrst');
  });
});
