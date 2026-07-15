import type { SVGProps } from 'react';

/**
 * MeetingBrain logo mark: an accent-gradient badge with a speech bubble
 * (the meeting) holding a spark (the AI analysis). The badge carries its
 * own background + colors, so it stays legible on any surface in either
 * theme. Decorative by default — pair it with the visible "MeetingBrain"
 * wordmark and keep `aria-hidden` so screen readers don't read the name twice.
 */
export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient
          id="mb-logo-gradient"
          x1="0"
          y1="0"
          x2="40"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3B9EFF" />
          <stop offset="1" stopColor="#0463D6" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#mb-logo-gradient)" />
      <rect x="9" y="11.5" width="22" height="15" rx="3.5" fill="#fff" />
      <path d="M13.5 26.5 L12.4 30.4 L17.6 26.5 Z" fill="#fff" />
      <path
        d="M20 14.8 L21.13 17.87 L24.2 19 L21.13 20.13 L20 23.2 L18.87 20.13 L15.8 19 L18.87 17.87 Z"
        fill="url(#mb-logo-gradient)"
      />
    </svg>
  );
}
