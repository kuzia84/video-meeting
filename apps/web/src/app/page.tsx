import type { ApiResponse } from '@video-meetings/shared';

const placeholderResponse: ApiResponse<string> = {
  success: true,
  message: 'Welcome',
  data: 'Video Meetings',
};

export default function Home() {
  return (
    <main>
      <h1>{placeholderResponse.data}</h1>
      <p>Monorepo is up and running.</p>
    </main>
  );
}
