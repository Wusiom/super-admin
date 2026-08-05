import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccountsService } from '../accounts/accounts.service';
import { PasswordResetService } from '../password/password-reset.service';
import { CurrentUser } from './current-user.decorator';
import type { AuthPrincipal } from './auth-principal';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto, ResetPasswordDto } from './dto/session.dto';
import { SessionService, type WebSessionTokens } from './session.service';
import { Public } from '../rbac/roles.decorator';

const REFRESH_COOKIE = 'super_admin_refresh';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/api/auth',
  secure: process.env.NODE_ENV === 'production',
};

@Controller('api/auth')
export class SessionController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly sessions: SessionService,
    private readonly reset: PasswordResetService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.accounts.authenticate(dto.email, dto.password);
    const tokens = await this.sessions.createSession(user, {
      userAgent: request.get('user-agent'),
    });
    return this.respondWithTokens(response, tokens);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req()
    request: Omit<Request, 'cookies'> & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.sessions.rotate(
      request.cookies?.[REFRESH_COOKIE] ?? '',
    );
    return this.respondWithTokens(response, tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: AuthPrincipal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.logout(user);
    response.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() user: AuthPrincipal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.logoutAll(user.userId);
    response.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.reset.resetPassword(dto.token, dto.password);
  }

  private respondWithTokens(response: Response, tokens: WebSessionTokens) {
    response.cookie(
      REFRESH_COOKIE,
      tokens.refreshToken,
      REFRESH_COOKIE_OPTIONS,
    );
    return { accessToken: tokens.accessToken };
  }
}
