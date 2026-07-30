import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailMessage, MailTransport } from './mail.service';

type SmtpTransporter = {
  sendMail(message: MailMessage & { from: string }): Promise<unknown>;
};

type NodemailerModule = {
  createTransport(options: {
    host: string;
    port: number;
    secure: boolean;
  }): SmtpTransporter;
};

const typedNodemailer = nodemailer as unknown as NodemailerModule;

@Injectable()
export class SmtpMailTransport implements MailTransport {
  private readonly transporter: SmtpTransporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.transporter = typedNodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
      secure: config.getOrThrow<boolean>('SMTP_SECURE'),
    });
    this.from = config.getOrThrow<string>('SMTP_FROM');
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      ...message,
    });
  }
}
