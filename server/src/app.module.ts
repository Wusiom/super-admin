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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    CoreModule,
    AuthModule,
    KnowledgeCaptureModule,
    MailModule,
  ],
  providers: [AccountsService],
  controllers: [AccountsController],
})
export class AppModule {}
