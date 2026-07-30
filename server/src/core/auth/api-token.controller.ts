import {
  Controller,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTokenService } from './api-token.service';

@Controller('api/auth')
export class ApiTokenController {
  private readonly logger = new Logger(ApiTokenController.name);

  constructor(private readonly apiTokenService: ApiTokenService) {}

  @Post('token')
  async getToken(
    @Req() request: { user?: { id: number } },
  ): Promise<{ token: string }> {
    if (!request.user) {
      throw new UnauthorizedException('Authenticated user is required');
    }
    const token = await this.apiTokenService.generateNewToken(request.user.id);
    return { token };
  }
}
