'use client';

import { Alert, buttonVariants } from '@heroui/react';
import { useRef, useState } from 'react';
import { ApiError, uploadAvatar, type UserProfile } from '@/lib/api/profile';

/**
 * The avatar file picker on the profile page: a native `<input type="file">` styled as a
 * button via its label (the native control cannot be restyled reliably, and a fake button
 * driving a hidden input loses keyboard access unless rewired by hand). Picking a file
 * uploads it immediately and hands the updated profile back through `onUploaded`, so the
 * shared current-user source refreshes the avatar everywhere.
 *
 * Rejections (unsupported format, too large, bad content) are shown **verbatim from the
 * API**, which owns that wording, and the previous avatar stays put because the server
 * only swaps it on success. A 401 bubbles to the page via `onUnauthorized`.
 */
export function AvatarUpload({
  onUploaded,
  onUnauthorized,
}: {
  onUploaded: (updated: UserProfile) => void;
  onUnauthorized: () => void;
}) {
  const [isUploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    // No unmount abort (unlike the meeting-file upload): the payload is ≤ 5 MB, and the
    // success path targets the still-mounted app-root current-user source, so a completion
    // after this component unmounts is harmless.
    setUploading(true);
    setError(null);
    try {
      onUploaded(await uploadAvatar(file));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : 'Не удалось загрузить аватар.');
    } finally {
      setUploading(false);
      // Clear the value so re-picking the same file fires `change` again.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* focus-within: the focusable element is the sr-only input, so the ring must be
          driven off the label wrapping it. */}
      <label
        className={`${buttonVariants({ variant: 'outline', size: 'sm' })} focus-within:ring-primary w-fit cursor-pointer focus-within:ring-2 focus-within:ring-offset-2`}
      >
        {isUploading ? 'Загрузка…' : 'Загрузить фото'}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          // Exactly what the API accepts — no image/* wildcard, which would let the picker
          // offer a GIF only for the upload to come back rejected.
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          disabled={isUploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
      </label>

      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </div>
  );
}
