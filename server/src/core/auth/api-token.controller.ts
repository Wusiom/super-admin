import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTokenService } from './api-token.service';

@Controller('api/auth')
export class ApiTokenController {
  private readonly logger = new Logger(ApiTokenController.name);

  constructor(private readonly apiTokenService: ApiTokenService) {}

  @Get('token')
  async getToken(): Promise<{ token: string }> {
    const token = await this.apiTokenService.generateNewToken();
    return { token };
  }
}
