export interface RegisterResult {
  accessToken: string;
  user: { id: string; email: string };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly messages: string[],
  ) {
    super(messages.join(', '));
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function registerUser(email: string, password: string): Promise<RegisterResult> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) {
    const messages: string[] = Array.isArray(body.message) ? body.message : [body.message];
    throw new ApiError(res.status, messages);
  }
  return body.data as RegisterResult;
}
