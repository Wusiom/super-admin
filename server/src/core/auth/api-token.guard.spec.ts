import { UnauthorizedException } from '@nestjs/common';
import { ApiTokenGuard } from './api-token.guard';

function contextFor(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('ApiTokenGuard 用户所有权', () => {
  it('受保护的扩展入口缺少 Authorization 时拒绝请求', async () => {
    const guard = new ApiTokenGuard({ validate: jest.fn() } as never);

    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('把已验证的 Token 所有者写入可信请求上下文', async () => {
    const principal = { userId: 9, scopes: ['capture:create'] };
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer raw-token' },
    };
    const guard = new ApiTokenGuard({
      validate: jest.fn().mockResolvedValue(principal),
    } as never);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.apiTokenPrincipal).toEqual(principal);
  });

  it.each([
    'Basic raw-token',
    'Bearer',
    'raw-token',
    'Bearer valid extra',
    'Bearer  raw-token',
    'Bearer raw-token ',
    ' Bearer raw-token',
  ])(
    '拒绝无效 Authorization 格式：%s',
    async (authorization) => {
      const validate = jest.fn();
      const request: Record<string, unknown> = {
        headers: { authorization },
      };
      const guard = new ApiTokenGuard({ validate } as never);

      await expect(
        guard.canActivate(contextFor(request)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(validate).not.toHaveBeenCalled();
      expect(request.apiTokenPrincipal).toBeUndefined();
    },
  );

  it.each([
    ['错误作用域', { userId: 9, scopes: ['notes:read'] }],
    ['未知 Token', null],
  ])('%s 不写入 principal', async (_name, principal) => {
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer raw-token' },
    };
    const guard = new ApiTokenGuard({
      validate: jest.fn().mockResolvedValue(principal),
    } as never);

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.apiTokenPrincipal).toBeUndefined();
  });
});
