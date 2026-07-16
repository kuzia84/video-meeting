import { decodeOriginalName } from './decode-original-name';

/** What busboy hands over for a raw UTF-8 `filename="..."`, as a browser sends it. */
const asBusboyLatin1 = (name: string) => Buffer.from(name, 'utf8').toString('latin1');

describe('decodeOriginalName', () => {
  it('repairs a Cyrillic name mangled by busboy’s latin1 decode', () => {
    expect(decodeOriginalName(asBusboyLatin1('Запись встречи.mp3'))).toBe('Запись встречи.mp3');
  });

  it('repairs an accented latin name mangled by busboy’s latin1 decode', () => {
    expect(decodeOriginalName(asBusboyLatin1('café.mp3'))).toBe('café.mp3');
  });

  it('leaves a plain ASCII name untouched', () => {
    expect(decodeOriginalName('recording.mp3')).toBe('recording.mp3');
  });

  it('leaves an already-decoded Cyrillic name alone (RFC 5987 filename*)', () => {
    // Busboy decodes filename*=UTF-8''… itself; re-decoding would destroy it.
    expect(decodeOriginalName('Запись встречи.mp3')).toBe('Запись встречи.mp3');
  });

  it('leaves an already-decoded accented name alone (RFC 5987 filename*)', () => {
    // 'é' is U+00E9, inside latin1 — only the invalid-UTF-8 check catches this one.
    expect(decodeOriginalName('café.mp3')).toBe('café.mp3');
  });

  it('handles an empty name', () => {
    expect(decodeOriginalName('')).toBe('');
  });
});
