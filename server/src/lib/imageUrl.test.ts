import { describe, expect, it } from 'vitest';
import { normalizeImageUrl } from './imageUrl';

describe('imageUrl', () => {
  it('allows HTTPS image URLs and local development HTTP URLs only', () => {
    expect(normalizeImageUrl(' https://img.example.com/kite.png ')).toBe('https://img.example.com/kite.png');
    expect(normalizeImageUrl('/api/images/raw/img-1')).toBe('/api/images/raw/img-1');
    expect(normalizeImageUrl('http://localhost:5173/kite.png')).toBe('http://localhost:5173/kite.png');
    expect(normalizeImageUrl('http://127.0.0.1:5173/kite.png')).toBe('http://127.0.0.1:5173/kite.png');
    expect(normalizeImageUrl('http://blog.example/api/images/raw/img-1')).toBe('/api/images/raw/img-1');
    expect(normalizeImageUrl('https://kitepop.example/api/images/raw/img-1')).toBe('/api/images/raw/img-1');
    expect(normalizeImageUrl('http://img.example.com/kite.png')).toBeUndefined();
    expect(normalizeImageUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizeImageUrl('data:image/svg+xml,<svg></svg>')).toBeUndefined();
  });
});
