import { validate } from 'class-validator';
import { AccountsController } from './accounts.controller';
import { EmailDto, RegisterDto, TokenDto } from './dto/register.dto';

describe('AccountsController', () => {
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
