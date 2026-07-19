'use client';

import { useEffect, useState } from 'react';
import { DefaultAvatar } from '@/components/default-avatar';
import { fetchAvatarBlob } from '@/lib/api/profile';

interface UserAvatarProps {
  /** The user's name, or null/blank when unset — the fallback letter prefers it. */
  name: string | null;
  /** The user's email — the fallback letter falls back to it. */
  email: string;
  /** The stored colour-solution name, for the fallback circle. */
  colorName: string;
  /** The stored avatar name (`UserProfile.avatarUrl`); null/blank means no uploaded image. */
  avatarUrl: string | null;
  /** Sizing (width/height/text size) — applied to both the image and the fallback circle. */
  className?: string;
}

/**
 * The user's avatar: their uploaded picture when there is one, otherwise the default
 * circle with their initial. The image is behind a JWT-guarded route, so it cannot be an
 * `<img src>` to the endpoint (that would send no token); the bytes are fetched with the
 * auth header and shown via an object URL, the same shape as the meeting-file download.
 *
 * `avatarUrl` is the stored name, which changes (new UUID) on every upload — so keying the
 * fetch on it re-loads the picture the moment it is replaced, with no reload. While the
 * image loads (and whenever there is none), the letter circle stands in, so there is never
 * a blank gap. Decorative — the name/email is shown as text alongside.
 */
export function UserAvatar({ name, email, colorName, avatarUrl, className }: UserAvatarProps) {
  const hasImage = Boolean(avatarUrl?.trim());
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasImage) {
      setObjectUrl(null);
      return;
    }
    // Drop any previous picture while the new one loads, so a stale/revoked URL is never
    // rendered — the letter circle shows in the meantime.
    setObjectUrl(null);

    let active = true;
    let created: string | null = null;
    fetchAvatarBlob()
      .then((blob) => {
        if (!active) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        // A failed load falls back to the letter circle rather than a broken image.
        if (active) setObjectUrl(null);
      });

    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [hasImage, avatarUrl]);

  if (hasImage && objectUrl) {
    return (
      // A blob: object URL, not a remote src — next/image cannot optimize it (no loader/
      // domain applies), and the bytes are already in memory, so a plain <img> is correct.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={objectUrl}
        alt=""
        aria-hidden="true"
        className={`inline-block shrink-0 rounded-full object-cover ${className ?? ''}`}
      />
    );
  }

  return <DefaultAvatar name={name} email={email} colorName={colorName} className={className} />;
}
