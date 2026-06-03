import { Module } from '@nestjs/common';
import { ApiTokenService } from './api-token.service';
import { ApiTokenGuard } from './api-token.guard';
import { ApiTokenController } from './api-token.controller';

@Module({
  providers: [ApiTokenService, ApiTokenGuard],
  controllers: [ApiTokenController],
  exports: [ApiTokenService, ApiTokenGuard],
})
export class AuthModule {}
