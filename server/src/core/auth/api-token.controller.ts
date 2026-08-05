import {
  Controller,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTokenService } from './api-token.service';
import { CurrentUser } from '../../auth/sessions/current-user.decorator';
import type { AuthPrincipal } from '../../auth/sessions/auth-principal';

@Controller('api/auth')
export class ApiTokenController {
  private readonly logger = new Logger(ApiTokenController.name);

  constructor(private readonly apiTokenService: ApiTokenService) {}

  @Post('token')
  async getToken(
    @CurrentUser() principal: AuthPrincipal | undefined,
  ): Promise<{ token: string }> {
    if (!principal) {
      throw new UnauthorizedException('Authenticated user is required');
    }
    const token = await this.apiTokenService.generateNewToken(principal.userId);
    return { token };
  }
}
