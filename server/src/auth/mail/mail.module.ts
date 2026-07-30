import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiagnosticMailTransport } from './diagnostic-mail.transport';
import { MAIL_TRANSPORT, MailService } from './mail.service';
import { SmtpMailTransport } from './smtp-mail.transport';

@Module({
  providers: [
    DiagnosticMailTransport,
    SmtpMailTransport,
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService, DiagnosticMailTransport, SmtpMailTransport],
      useFactory: (
        config: ConfigService,
        diagnostic: DiagnosticMailTransport,
        smtp: SmtpMailTransport,
      ) =>
        config.get<string>('NODE_ENV') === 'test' ||
        config.get<string>('SMTP_HOST') === 'diagnostic'
          ? diagnostic
          : smtp,
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
