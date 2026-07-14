import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthResult } from './auth.types';

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  issue(id: string, email: string): AuthResult {
    const accessToken = this.jwtService.sign({ sub: id, email });
    return { accessToken, user: { id, email } };
  }
}
