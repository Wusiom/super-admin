import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTokenPrincipal, ApiTokenService } from './api-token.service';

export interface ApiTokenAuthenticatedRequest {
  headers: { authorization?: string };
  apiTokenPrincipal?: ApiTokenPrincipal;
}

@Injectable()
export class ApiTokenGuard implements CanActivate {
  private readonly logger = new Logger(ApiTokenGuard.name);

  constructor(private readonly apiTokenService: ApiTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<ApiTokenAuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('API token is required');
    }

    const match = /^Bearer ([^\s]+)$/.exec(authHeader);

    if (!match) {
      throw new UnauthorizedException(
        'Invalid authorization format. Expected: Bearer <token>',
      );
    }

    const token = match[1];

    const principal = await this.apiTokenService.validate(token);
    if (!principal || !principal.scopes.includes('capture:create')) {
      throw new UnauthorizedException('Invalid API token');
    }

    request.apiTokenPrincipal = principal;
    return true;
  }
}
