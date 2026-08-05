import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AuthPrincipal } from './auth-principal';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthPrincipal }>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer '))
      throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync<AuthPrincipal>(
        authorization.slice(7),
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );
      if (
        !Number.isInteger(payload.userId) ||
        !Number.isInteger(payload.sessionId) ||
        (payload.role !== 'USER' && payload.role !== 'ADMIN') ||
        payload.kind !== 'web'
      )
        throw new UnauthorizedException();
      request.user = {
        userId: payload.userId,
        role: payload.role,
        sessionId: payload.sessionId,
        kind: 'web',
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
