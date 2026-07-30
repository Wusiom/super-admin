import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { DiagnosticMailTransport } from './diagnostic-mail.transport';
import { MailService, MailTransport } from './mail.service';
import { SmtpMailTransport } from './smtp-mail.transport';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('MailService', () => {
  it('通过 Transport 发送含限时原始令牌的验证链接', async () => {
    const transport: MailTransport = { send: jest.fn() };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('https://app.example.test/base'),
    };
    const service = new MailService(transport, config as never);

    await service.sendVerification(
      'alice@example.com',
      'verification token/with spaces',
    );

    expect(transport.send).toHaveBeenCalledWith({
      to: 'alice@example.com',
      subject: '验证你的邮箱',
      text: expect.stringContaining(
        'https://app.example.test/verify-email?token=verification%20token%2Fwith%20spaces',
      ),
    });
  });

  it('通过 Transport 发送含限时原始令牌的密码重置链接', async () => {
    const transport: MailTransport = { send: jest.fn() };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('https://app.example.test'),
    };
    const service = new MailService(transport, config as never);

    await service.sendPasswordReset('alice@example.com', 'reset-token');

    expect(transport.send).toHaveBeenCalledWith({
      to: 'alice@example.com',
      subject: '重置你的密码',
      text: expect.stringContaining(
        'https://app.example.test/reset-password?token=reset-token',
      ),
    });
  });
});

describe('DiagnosticMailTransport', () => {
  it('日志只包含邮件元数据，不包含正文中的原始令牌', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const transport = new DiagnosticMailTransport();

    await transport.send({
      to: 'alice@example.com',
      subject: '验证你的邮箱',
      text: 'https://app.example.test/verify-email?token=RAW_TOKEN_SENTINEL',
    });

    const serializedLog = JSON.stringify(log.mock.calls);
    expect(serializedLog).toContain('alice@example.com');
    expect(serializedLog).toContain('验证你的邮箱');
    expect(serializedLog).not.toContain('RAW_TOKEN_SENTINEL');
    log.mockRestore();
  });
});

describe('SmtpMailTransport', () => {
  it('使用环境中的 SMTP 发件配置发送邮件', async () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);
    const values: Record<string, unknown> = {
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      SMTP_FROM: 'noreply@example.test',
    };
    const config = {
      getOrThrow: jest.fn((key: string) => values[key]),
    };
    const transport = new SmtpMailTransport(config as never);

    await transport.send({
      to: 'alice@example.com',
      subject: '验证你的邮箱',
      text: 'mail body',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.test',
      port: 465,
      secure: true,
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'noreply@example.test',
      to: 'alice@example.com',
      subject: '验证你的邮箱',
      text: 'mail body',
    });
  });
});
