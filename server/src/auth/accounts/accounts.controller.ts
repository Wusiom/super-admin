import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { EmailDto, RegisterDto, TokenDto } from './dto/register.dto';
import { Public } from '../rbac/roles.decorator';

@Controller('api/auth')
@Public()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.accounts.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.ACCEPTED)
  verifyEmail(@Body() dto: TokenDto) {
    return this.accounts.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  resendVerification(@Body() dto: EmailDto) {
    return this.accounts.resendVerification(dto.email);
  }

  @Post('password-recovery')
  @HttpCode(HttpStatus.ACCEPTED)
  requestPasswordReset(@Body() dto: EmailDto) {
    return this.accounts.requestPasswordReset(dto.email);
  }
}
