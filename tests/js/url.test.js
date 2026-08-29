import { describe, it, expect } from 'vitest';
import { buildUrl } from '../../assets/js/base/url.js';

describe('buildUrl', () => {
  it('добавляет path к baseUrl со слешем в конце', () => {
    expect(buildUrl('https://example.com/', 'api/send')).toBe('https://example.com/api/send');
    expect(buildUrl('https://example.com/', '/api/send')).toBe('https://example.com/api/send');
  });

  it('нормализует baseUrl без trailing slash', () => {
    expect(buildUrl('https://example.com', 'page')).toBe('https://example.com/page');
  });

  it('при пустом baseUrl использует /', () => {
    expect(buildUrl('', 'contacts')).toBe('/contacts');
  });
});
