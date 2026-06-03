import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTokenService } from './api-token.service';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  private readonly logger = new Logger(ApiTokenGuard.name);

  constructor(private readonly apiTokenService: ApiTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // 无 Authorization header → 放行（Web 前端请求，走 session 或无认证）
    if (!authHeader) {
      return true;
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization format. Expected: Bearer <token>');
    }

    const isValid = await this.apiTokenService.validate(token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid API token');
    }

    return true;
  }
}
