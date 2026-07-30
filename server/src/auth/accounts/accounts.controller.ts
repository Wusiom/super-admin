import { Body, Controller, Post } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { EmailDto, RegisterDto, TokenDto } from './dto/register.dto';

@Controller('api/auth')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.accounts.register(dto);
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: TokenDto) {
    return this.accounts.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: EmailDto) {
    return this.accounts.resendVerification(dto.email);
  }

  @Post('password-recovery')
  requestPasswordReset(@Body() dto: EmailDto) {
    return this.accounts.requestPasswordReset(dto.email);
  }
}
