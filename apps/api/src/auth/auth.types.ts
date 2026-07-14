export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
}
