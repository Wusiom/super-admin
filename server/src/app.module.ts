import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CoreModule } from './core/core.module';
import { AuthModule } from './core/auth/auth.module';
import { KnowledgeCaptureModule } from './tools/knowledge-capture/knowledge-capture.module';
import { validateEnvironment } from './config/environment';
import { MailModule } from './auth/mail/mail.module';
import { AccountsService } from './auth/accounts/accounts.service';
import { AccountsController } from './auth/accounts/accounts.controller';
import { JwtModule } from '@nestjs/jwt';
import { SessionController } from './auth/sessions/session.controller';
import { SessionService } from './auth/sessions/session.service';
import { JwtAuthGuard } from './auth/sessions/jwt-auth.guard';
import { PasswordResetService } from './auth/password/password-reset.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    CoreModule,
    AuthModule,
    KnowledgeCaptureModule,
    MailModule,
    JwtModule,
  ],
  providers: [
    AccountsService,
    SessionService,
    PasswordResetService,
    JwtAuthGuard,
  ],
  controllers: [AccountsController, SessionController],
})
export class AppModule {}
