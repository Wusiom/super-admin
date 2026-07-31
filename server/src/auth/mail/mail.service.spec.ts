import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import { DiagnosticMailTransport } from './diagnostic-mail.transport';
import {
  MAIL_TRANSPORT,
  MailMessage,
  MailService,
  MailTransport,
} from './mail.service';
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
  afterEach(() => {
    jest.useRealTimers();
  });

  it('app.close 会等待已开始的受管邮件任务完成', async () => {
    let finishSend: () => void = () => undefined;
    const pendingSend = new Promise<void>((resolve) => {
      finishSend = resolve;
    });
    const transport: MailTransport = {
      send: jest.fn(() => pendingSend),
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('https://app.example.test'),
      get: jest.fn().mockReturnValue(1_000),
    };
    const module = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MAIL_TRANSPORT, useValue: transport },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    const app: INestApplication = module.createNestApplication();
    await app.init();
    const service = app.get(MailService);
    service.dispatchVerification('alice@example.com', 'token');
    await Promise.resolve();

    let closeSettled = false;
    const close = app.close().then(() => {
      closeSettled = true;
    });
    await Promise.resolve();
    expect(closeSettled).toBe(false);

    finishSend();
    await close;
    expect(closeSettled).toBe(true);
  });

  it('永不结束的受管任务在 drain 截止后不会无限阻塞', async () => {
    jest.useFakeTimers();
    const transport: MailTransport = {
      send: jest.fn(() => new Promise<void>(() => undefined)),
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('https://app.example.test'),
      get: jest.fn().mockReturnValue(1_000),
    };
    const service = new MailService(transport, config as never);
    service.dispatchVerification('alice@example.com', 'token');

    let drainSettled = false;
    void service.onModuleDestroy().then(() => {
      drainSettled = true;
    });
    await Promise.resolve();
    expect(drainSettled).toBe(false);

    await jest.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    expect(drainSettled).toBe(true);
  });

  it('受管验证任务只在返回邮件载荷后发送', async () => {
    const send = jest.fn<Promise<void>, [MailMessage]>().mockResolvedValue();
    const config = {
      getOrThrow: jest.fn().mockReturnValue('https://app.example.test'),
      get: jest.fn().mockReturnValue(1_000),
    };
    const service = new MailService({ send }, config as never);
    const dispatchTask = (
      service as unknown as {
        dispatchVerificationTask?: (
          work: () => Promise<{ email: string; token: string } | null>,
        ) => void;
      }
    ).dispatchVerificationTask;

    expect(dispatchTask).toBeDefined();
    dispatchTask?.call(service, () =>
      Promise.resolve({
        email: 'alice@example.com',
        token: 'verification-token',
      }),
    );
    await service.onModuleDestroy();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe('alice@example.com');
    expect(send.mock.calls[0][0].text).toContain('verification-token');
  });

  it('通过 Transport 发送含限时原始令牌的验证链接', async () => {
    const send = jest.fn<
      Promise<void>,
      [Parameters<MailTransport['send']>[0]]
    >();
    const transport: MailTransport = { send };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('https://app.example.test/base'),
      get: jest.fn().mockReturnValue(1_000),
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
      get: jest.fn().mockReturnValue(1_000),
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
      get: jest.fn().mockReturnValue(1_000),
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

  it('受管数据库任务失败只记录脱敏事件且不发送邮件', async () => {
    const send = jest.fn<Promise<void>, [MailMessage]>().mockResolvedValue();
    const config = {
      getOrThrow: jest.fn().mockReturnValue('https://app.example.test'),
      get: jest.fn().mockReturnValue(1_000),
    };
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const service = new MailService({ send }, config as never);

    service.dispatchPasswordResetTask(() =>
      Promise.reject(
        new Error('DATABASE_SENTINEL alice@example.com RAW_TOKEN_SENTINEL'),
      ),
    );
    await service.onModuleDestroy();

    expect(send).not.toHaveBeenCalled();
    const serializedLog = JSON.stringify(error.mock.calls);
    expect(serializedLog).toContain('mail_dispatch_failed');
    expect(serializedLog).toContain('password_reset');
    expect(serializedLog).not.toContain('DATABASE_SENTINEL');
    expect(serializedLog).not.toContain('alice@example.com');
    expect(serializedLog).not.toContain('RAW_TOKEN_SENTINEL');
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
      SMTP_CONNECTION_TIMEOUT_MS: 5_000,
      SMTP_GREETING_TIMEOUT_MS: 5_000,
      SMTP_SOCKET_TIMEOUT_MS: 8_000,
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
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 8_000,
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
      SMTP_CONNECTION_TIMEOUT_MS: 5_000,
      SMTP_GREETING_TIMEOUT_MS: 5_000,
      SMTP_SOCKET_TIMEOUT_MS: 8_000,
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
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 8_000,
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
