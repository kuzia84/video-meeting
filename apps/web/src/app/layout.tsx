import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Video Meetings',
  description: 'Video meetings application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
