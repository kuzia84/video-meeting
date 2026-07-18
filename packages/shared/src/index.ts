export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}

export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
}

// The signed-in user's own profile, returned by GET /users/me. `name` and
// `avatarUrl` are null until the user sets them. Never carries passwordHash.
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}
