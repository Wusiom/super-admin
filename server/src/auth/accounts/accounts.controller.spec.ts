import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import request from 'supertest';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { EmailDto, RegisterDto, TokenDto } from './dto/register.dto';

describe('AccountsController', () => {
  it.each([
    [
      '/api/auth/register',
      { email: 'alice@example.com', password: 'secret' },
      201,
    ],
    ['/api/auth/verify-email', { token: 'verification-token' }, 202],
    ['/api/auth/resend-verification', { email: 'alice@example.com' }, 202],
    ['/api/auth/password-recovery', { email: 'alice@example.com' }, 202],
  ] as const)(
    'POST %s 返回明确的 HTTP 状态合约',
    async (path, body, status) => {
      const accounts = {
        register: jest.fn().mockResolvedValue({ message: 'accepted' }),
        verifyEmail: jest.fn().mockResolvedValue({ message: 'accepted' }),
        resendVerification: jest
          .fn()
          .mockResolvedValue({ message: 'accepted' }),
        requestPasswordReset: jest
          .fn()
          .mockResolvedValue({ message: 'accepted' }),
      };
      const module = await Test.createTestingModule({
        controllers: [AccountsController],
        providers: [{ provide: AccountsService, useValue: accounts }],
      }).compile();
      const app: INestApplication = module.createNestApplication();
      await app.init();

      try {
        const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
        await request(httpServer)
          .post(path)
          .send(body)
          .expect(status)
          .expect({ message: 'accepted' });
      } finally {
        await app.close();
      }
    },
  );

  it('将注册请求交给账户服务', async () => {
    const accounts = {
      register: jest.fn().mockResolvedValue({ message: 'registered' }),
    };
    const controller = new AccountsController(accounts as never);
    const dto = {
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    };

    await expect(controller.register(dto)).resolves.toEqual({
      message: 'registered',
    });
    expect(accounts.register).toHaveBeenCalledWith(dto);
  });

  it.each([
    ['verifyEmail', 'verifyEmail', { token: 'verification-token' }],
    [
      'resendVerification',
      'resendVerification',
      { email: 'alice@example.com' },
    ],
    [
      'requestPasswordReset',
      'requestPasswordReset',
      { email: 'alice@example.com' },
    ],
  ] as const)(
    '将 %s 请求交给账户服务',
    async (controllerMethod, serviceMethod, dto) => {
      const accounts = {
        [serviceMethod]: jest.fn().mockResolvedValue({ message: 'generic' }),
      };
      const controller = new AccountsController(accounts as never);

      await expect(controller[controllerMethod](dto as never)).resolves.toEqual(
        {
          message: 'generic',
        },
      );
      expect(accounts[serviceMethod]).toHaveBeenCalledWith(
        'token' in dto ? dto.token : dto.email,
      );
    },
  );
});

describe('账户请求 DTO', () => {
  it('注册 DTO 拒绝无效邮箱与过短密码', async () => {
    const dto = Object.assign(new RegisterDto(), {
      email: 'not-an-email',
      password: 'short',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual([
      'email',
      'password',
    ]);
  });

  it('邮箱 DTO 拒绝无效邮箱', async () => {
    const dto = Object.assign(new EmailDto(), { email: 'not-an-email' });

    await expect(validate(dto)).resolves.toHaveLength(1);
  });

  it('令牌 DTO 拒绝空令牌', async () => {
    const dto = Object.assign(new TokenDto(), { token: '' });

    await expect(validate(dto)).resolves.toHaveLength(1);
  });
});
