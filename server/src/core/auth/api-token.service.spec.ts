import { ApiTokenService } from './api-token.service';

describe('ApiTokenService 用户所有权', () => {
  it('验证 Token 后返回可信所有者和作用域，而不是全局布尔值', async () => {
    const prisma = {
      apiToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          userId: 7,
          scopes: ['capture:create'],
          revokedAt: null,
          expiresAt: null,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const service = new ApiTokenService(prisma as never);

    await expect(service.validate('raw-token')).resolves.toEqual({
      userId: 7,
      scopes: ['capture:create'],
    });
  });

  it('应用启动时不再自动制造无主 Token', async () => {
    const prisma = {
      apiToken: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const service = new ApiTokenService(prisma as never);

    await service.onModuleInit();

    expect(prisma.apiToken.findFirst).not.toHaveBeenCalled();
    expect(prisma.apiToken.create).not.toHaveBeenCalled();
  });

  it.each([
    ['已撤销', { revokedAt: new Date(), expiresAt: null }],
    ['已过期', { revokedAt: null, expiresAt: new Date(0) }],
    ['不存在', null],
  ])(
    '%s Token 不建立 principal，也不更新最后使用时间',
    async (_name, token) => {
      const prisma = {
        apiToken: {
          findUnique: jest.fn().mockResolvedValue(
            token
              ? {
                  id: 4,
                  userId: 8,
                  scopes: ['capture:create'],
                  ...token,
                }
              : null,
          ),
          update: jest.fn(),
        },
      };
      const service = new ApiTokenService(prisma as never);

      await expect(service.validate('invalid-token')).resolves.toBeNull();
      expect(prisma.apiToken.update).not.toHaveBeenCalled();
    },
  );
});
