import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { DiagnosticMailTransport } from './diagnostic-mail.transport';
import { MailService, MailTransport } from './mail.service';
import { SmtpMailTransport } from './smtp-mail.transport';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

type CreateTransportMock = jest.Mock<
  { sendMail: jest.Mock<Promise<void>, [unknown]> },
  [unknown]
>;

const mockedNodemailer = nodemailer as unknown as {
  createTransport: CreateTransportMock;
};

describe('MailService', () => {
  it('通过 Transport 发送含限时原始令牌的验证链接', async () => {
    const send = jest.fn<
      Promise<void>,
      [Parameters<MailTransport['send']>[0]]
    >();
    const transport: MailTransport = { send };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('https://app.example.test/base'),
    };
    const service = new MailService(transport, config as never);

    await service.sendVerification(
      'alice@example.com',
      'verification token/with spaces',
    );

    const sentMessage = send.mock.calls[0][0];
    expect(sentMessage.to).toBe('alice@example.com');
    expect(sentMessage.subject).toBe('验证你的邮箱');
    expect(sentMessage.text).toContain(
      'https://app.example.test/verify-email?token=verification%20token%2Fwith%20spaces',
    );
  });

  it('通过 Transport 发送含限时原始令牌的密码重置链接', async () => {
    const send = jest.fn<
      Promise<void>,
      [Parameters<MailTransport['send']>[0]]
    >();
    const transport: MailTransport = { send };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('https://app.example.test'),
    };
    const service = new MailService(transport, config as never);

    await service.sendPasswordReset('alice@example.com', 'reset-token');

    const sentMessage = send.mock.calls[0][0];
    expect(sentMessage.to).toBe('alice@example.com');
    expect(sentMessage.subject).toBe('重置你的密码');
    expect(sentMessage.text).toContain(
      'https://app.example.test/reset-password?token=reset-token',
    );
  });

  it('后台派发失败时记录不含邮件、令牌和 SMTP 原始响应的结构化事件', async () => {
    const transport: MailTransport = {
      send: jest
        .fn()
        .mockRejectedValue(
          new Error(
            'SMTP_RESPONSE_SENTINEL alice@example.com RAW_TOKEN_SENTINEL',
          ),
        ),
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('https://app.example.test'),
    };
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const service = new MailService(transport, config as never);

    expect(
      service.dispatchVerification('alice@example.com', 'RAW_TOKEN_SENTINEL'),
    ).toBeUndefined();
    await service.onModuleDestroy();

    const serializedLog = JSON.stringify(error.mock.calls);
    expect(serializedLog).toContain('mail_dispatch_failed');
    expect(serializedLog).toContain('verification');
    expect(serializedLog).not.toContain('alice@example.com');
    expect(serializedLog).not.toContain('RAW_TOKEN_SENTINEL');
    expect(serializedLog).not.toContain('SMTP_RESPONSE_SENTINEL');
    error.mockRestore();
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
    const sendMail = jest
      .fn<Promise<void>, [unknown]>()
      .mockResolvedValue(undefined);
    mockedNodemailer.createTransport.mockReturnValue({
      sendMail,
    });
    const values: Record<string, unknown> = {
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      SMTP_FROM: 'noreply@example.test',
    };
    const config = {
      getOrThrow: jest.fn((key: string) => values[key]),
      get: jest.fn(() => undefined),
    };
    const transport = new SmtpMailTransport(config as never);

    await transport.send({
      to: 'alice@example.com',
      subject: '验证你的邮箱',
      text: 'mail body',
    });

    expect(mockedNodemailer.createTransport).toHaveBeenCalledWith({
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

  it('成对提供 SMTP 认证时传给 Nodemailer 且不写入日志', () => {
    const sendMail = jest
      .fn<Promise<void>, [unknown]>()
      .mockResolvedValue(undefined);
    mockedNodemailer.createTransport.mockReturnValue({
      sendMail,
    });
    const values: Record<string, unknown> = {
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      SMTP_FROM: 'noreply@example.test',
      SMTP_USER: 'smtp-user',
      SMTP_PASSWORD: 'SMTP_PASSWORD_SENTINEL_7a42',
    };
    const config = {
      getOrThrow: jest.fn((key: string) => values[key]),
      get: jest.fn((key: string) => values[key]),
    };
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    new SmtpMailTransport(config as never);

    expect(mockedNodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      auth: {
        user: 'smtp-user',
        pass: 'SMTP_PASSWORD_SENTINEL_7a42',
      },
    });
    expect(
      JSON.stringify([...log.mock.calls, ...error.mock.calls]),
    ).not.toContain('SMTP_PASSWORD_SENTINEL_7a42');
    log.mockRestore();
    error.mockRestore();
  });
});
