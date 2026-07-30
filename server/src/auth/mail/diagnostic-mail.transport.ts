import { Injectable, Logger } from '@nestjs/common';
import { MailMessage, MailTransport } from './mail.service';

@Injectable()
export class DiagnosticMailTransport implements MailTransport {
  private readonly logger = new Logger(DiagnosticMailTransport.name);

  send(message: MailMessage): Promise<void> {
    this.logger.log({
      event: 'diagnostic_mail',
      to: message.to,
      subject: message.subject,
    });
    return Promise.resolve();
  }
}
