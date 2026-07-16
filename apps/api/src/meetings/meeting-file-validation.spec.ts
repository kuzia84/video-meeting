import { BadRequestException } from '@nestjs/common';
import {
  fileTooLargeMessage,
  MAX_UPLOAD_BYTES,
  meetingFileFilter,
} from './meeting-file-validation';

/** Runs the filter and reports what it decided. */
function filter(originalname: string, mimetype: string): { accepted: boolean; message?: string } {
  let result: { accepted: boolean; message?: string } | undefined;
  meetingFileFilter({}, { originalname, mimetype }, (error, acceptFile) => {
    result = error
      ? { accepted: false, message: (error as BadRequestException).message }
      : { accepted: acceptFile };
  });
  if (!result) {
    throw new Error('fileFilter did not call its callback');
  }
  return result;
}

describe('meetingFileFilter', () => {
  it.each([
    ['recording.mp3', 'audio/mpeg'],
    ['recording.wav', 'audio/x-wav'],
    ['recording.m4a', 'audio/x-m4a'],
    ['recording.mp4', 'video/mp4'],
    ['Запись встречи.mp3', 'audio/mpeg'],
    ['RECORDING.MP3', 'audio/mpeg'],
    ['unknown-to-the-client.m4a', 'application/octet-stream'],
  ])('accepts %s sent as %s', (name, type) => {
    expect(filter(name, type)).toEqual({ accepted: true });
  });

  it('rejects an .exe, naming the extension', () => {
    const { accepted, message } = filter('malware.exe', 'application/x-msdownload');
    expect(accepted).toBe(false);
    expect(message).toContain('.exe');
    expect(message).toContain('mp3, wav, m4a, mp4');
  });

  it('rejects a file with no extension', () => {
    const { accepted, message } = filter('recording', 'audio/mpeg');
    expect(accepted).toBe(false);
    expect(message).toContain('расширения');
  });

  it('rejects an allowed extension whose declared type contradicts it', () => {
    const { accepted, message } = filter('not-really.mp3', 'text/html');
    expect(accepted).toBe(false);
    expect(message).toContain('text/html');
  });

  it('rejects a Cyrillic-named .exe, decoding the name the way busboy delivers it', () => {
    // The extension check must see through busboy's latin1 mangling, not around it.
    const asBusboySends = Buffer.from('Вирус.exe', 'utf8').toString('latin1');
    const { accepted, message } = filter(asBusboySends, 'application/octet-stream');
    expect(accepted).toBe(false);
    expect(message).toContain('.exe');
  });
});

describe('fileTooLargeMessage', () => {
  it('names the limit, which is what the PRD requires and Nest omits', () => {
    expect(fileTooLargeMessage()).toContain('100 МБ');
  });
});

describe('MAX_UPLOAD_BYTES', () => {
  it('is 100 MB and fits PostgreSQL INTEGER, which MeetingFile.size maps to', () => {
    expect(MAX_UPLOAD_BYTES).toBe(104_857_600);
    expect(MAX_UPLOAD_BYTES).toBeLessThan(2_147_483_647);
  });
});
