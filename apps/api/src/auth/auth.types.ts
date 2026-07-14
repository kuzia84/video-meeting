export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
}

export interface AuthUser {
  userId: string;
  email: string;
}
