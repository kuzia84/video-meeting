import { BadRequestException } from '@nestjs/common';
import {
  avatarFileFilter,
  avatarTooLargeMessage,
  MAX_AVATAR_BYTES,
  MULTER_AVATAR_SIZE_LIMIT,
} from './avatar-upload-validation';

type FilterResult = { error: Error | null; accept: boolean };

function runFilter(originalname: string, mimetype: string): FilterResult {
  let captured: FilterResult = { error: null, accept: false };
  avatarFileFilter({}, { originalname, mimetype }, (error, accept) => {
    captured = { error, accept };
  });
  return captured;
}

describe('avatar upload validation', () => {
  it('caps the avatar at 5 MB', () => {
    expect(MAX_AVATAR_BYTES).toBe(5 * 1024 * 1024);
  });

  it('hands multer one byte past the cap so a file of exactly 5 MB still passes', () => {
    // Busboy trips when the byte count *reaches* fileSize, so the limit must be MAX + 1.
    expect(MULTER_AVATAR_SIZE_LIMIT).toBe(MAX_AVATAR_BYTES + 1);
  });

  it('names the 5 MB limit in the too-large message', () => {
    expect(avatarTooLargeMessage()).toContain('5');
  });

  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['PHOTO.JPG', 'image/jpeg'],
    ['avatar.png', 'image/png'],
    ['avatar.webp', 'image/webp'],
    ['фото.png', 'image/png'],
  ])('accepts %s (%s)', (name, mime) => {
    const { error, accept } = runFilter(name, mime);
    expect(error).toBeNull();
    expect(accept).toBe(true);
  });

  it.each([
    ['doc.pdf', 'application/pdf'],
    ['note.txt', 'text/plain'],
    ['clip.mp4', 'video/mp4'],
    ['image.gif', 'image/gif'],
    ['noext', 'image/png'],
  ])('rejects %s (%s) as an unsupported type', (name, mime) => {
    const { error, accept } = runFilter(name, mime);
    expect(accept).toBe(false);
    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('rejects a mismatched declared type even with an allowed extension', () => {
    const { error, accept } = runFilter('photo.png', 'application/pdf');
    expect(accept).toBe(false);
    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('lists the allowed formats in the rejection message', () => {
    const { error } = runFilter('doc.pdf', 'application/pdf');
    expect((error as BadRequestException).message).toMatch(/JPEG.*PNG.*WebP/i);
  });
});
