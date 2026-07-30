import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AccountsService } from './accounts.service';

type StoredUser = {
  id: number;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  displayName: string | null;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'DISABLED';
  emailVerifiedAt: Date | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type StoredToken = {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

function createPrismaFake() {
  const users: StoredUser[] = [];
  const emailTokens: StoredToken[] = [];
  const passwordResetTokens: StoredToken[] = [];

  const tokenDelegate = (tokens: StoredToken[]) => ({
    create: jest.fn(
      async ({
        data,
      }: {
        data: Omit<
          StoredToken,
          'id' | 'createdAt' | 'consumedAt' | 'revokedAt'
        >;
      }) => {
        const token: StoredToken = {
          id: tokens.length + 1,
          ...data,
          consumedAt: null,
          revokedAt: null,
          createdAt: new Date(),
        };
        tokens.push(token);
        return token;
      },
    ),
    findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const token = tokens.find(
        (candidate) => candidate.tokenHash === where.tokenHash,
      );
      if (!token) {
        return null;
      }

      return {
        ...token,
        user: users.find((user) => user.id === token.userId),
      };
    }),
    findFirst: jest.fn(
      async ({
        where,
      }: {
        where: {
          userId: number;
          consumedAt?: null;
          revokedAt?: null;
        };
      }) =>
        [...tokens]
          .reverse()
          .find(
            (token) =>
              token.userId === where.userId &&
              (where.consumedAt !== null || token.consumedAt === null) &&
              (where.revokedAt !== null || token.revokedAt === null),
          ) ?? null,
    ),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: {
          id?: number;
          userId?: number;
          consumedAt?: null;
          revokedAt?: null;
          expiresAt?: { gt: Date };
        };
        data: Partial<StoredToken>;
      }) => {
        let count = 0;
        for (const token of tokens) {
          const matches =
            (where.id === undefined || token.id === where.id) &&
            (where.userId === undefined || token.userId === where.userId) &&
            (where.consumedAt !== null || token.consumedAt === null) &&
            (where.revokedAt !== null || token.revokedAt === null) &&
            (!where.expiresAt || token.expiresAt > where.expiresAt.gt);
          if (matches) {
            Object.assign(token, data);
            count += 1;
          }
        }
        return { count };
      },
    ),
  });

  const prisma = {
    user: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { emailNormalized?: string; id?: number };
        }) =>
          users.find(
            (user) =>
              (where.emailNormalized === undefined ||
                user.emailNormalized === where.emailNormalized) &&
              (where.id === undefined || user.id === where.id),
          ) ?? null,
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: Pick<StoredUser, 'email' | 'emailNormalized' | 'passwordHash'>;
        }) => {
          if (
            users.some((user) => user.emailNormalized === data.emailNormalized)
          ) {
            throw Object.assign(new Error('unique constraint'), {
              code: 'P2002',
            });
          }
          const now = new Date();
          const user: StoredUser = {
            id: users.length + 1,
            ...data,
            displayName: null,
            role: 'USER',
            status: 'ACTIVE',
            emailVerifiedAt: null,
            disabledAt: null,
            createdAt: now,
            updatedAt: now,
          };
          users.push(user);
          return user;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: number };
          data: Partial<StoredUser>;
        }) => {
          const user = users.find((candidate) => candidate.id === where.id);
          if (!user) {
            throw new Error('user not found');
          }
          Object.assign(user, data);
          return user;
        },
      ),
    },
    emailToken: tokenDelegate(emailTokens),
    passwordResetToken: tokenDelegate(passwordResetTokens),
    $transaction: jest.fn(async (operation: unknown) => {
      if (typeof operation === 'function') {
        return operation(prisma);
      }
      return Promise.all(operation as Promise<unknown>[]);
    }),
  };

  return { prisma, users, emailTokens, passwordResetTokens };
}

function createFixture() {
  const database = createPrismaFake();
  const mail = {
    sendVerification: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AccountsService(database.prisma as never, mail as never);

  return { ...database, mail, service };
}

describe('AccountsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('规范化邮箱并只保存 Argon2id 密码哈希', async () => {
    const { service, users } = createFixture();
    const password = 'Correct-Horse-Battery-Staple-42';

    await service.register({ email: '  Alice@Example.COM ', password });

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: 'Alice@Example.COM',
      emailNormalized: 'alice@example.com',
      emailVerifiedAt: null,
    });
    expect(users[0].passwordHash).toMatch(/^\$argon2id\$/u);
    expect(users[0].passwordHash).not.toContain(password);
    await expect(argon2.verify(users[0].passwordHash, password)).resolves.toBe(
      true,
    );
  });

  it('拒绝大小写与首尾空白不同的重复邮箱', async () => {
    const { service } = createFixture();

    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });

    await expect(
      service.register({
        email: ' ALICE@EXAMPLE.COM ',
        password: 'Another-Correct-Horse-Battery-43',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('邮箱验证前即使密码正确也拒绝认证', async () => {
    const { service } = createFixture();
    const password = 'Correct-Horse-Battery-Staple-42';
    await service.register({ email: 'alice@example.com', password });

    await expect(
      service.authenticate('alice@example.com', password),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('验证成功后允许使用正确密码认证且不返回密码哈希', async () => {
    const { service, mail } = createFixture();
    const password = 'Correct-Horse-Battery-Staple-42';
    await service.register({ email: 'alice@example.com', password });
    const rawToken = mail.sendVerification.mock.calls[0][1] as string;
    await service.verifyEmail(rawToken);

    await expect(
      service.authenticate(' ALICE@example.com ', password),
    ).resolves.toEqual({
      id: 1,
      email: 'alice@example.com',
      role: 'USER',
    });
  });

  it('验证令牌限时、哈希存储且只能兑换一次', async () => {
    const { service, mail, users, emailTokens } = createFixture();
    const startedAt = new Date();
    const response = await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    const rawToken = mail.sendVerification.mock.calls[0][1] as string;

    expect(emailTokens).toHaveLength(1);
    expect(emailTokens[0].tokenHash).not.toBe(rawToken);
    expect(emailTokens[0].expiresAt.getTime()).toBeGreaterThan(
      startedAt.getTime(),
    );
    expect(emailTokens[0].expiresAt.getTime()).toBeLessThanOrEqual(
      startedAt.getTime() + 24 * 60 * 60 * 1000,
    );
    expect(JSON.stringify(response)).not.toContain(rawToken);

    await service.verifyEmail(rawToken);

    expect(users[0].emailVerifiedAt).toEqual(new Date());
    expect(emailTokens[0].consumedAt).toEqual(new Date());
    await expect(service.verifyEmail(rawToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    ['无效', 'invalid-token', false],
    ['过期', null, true],
  ])('%s验证令牌不能激活账户', async (_name, suppliedToken, expireToken) => {
    const { service, mail, users, emailTokens } = createFixture();
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    const issuedToken = mail.sendVerification.mock.calls[0][1] as string;
    if (expireToken) {
      emailTokens[0].expiresAt = new Date(Date.now() - 1);
    }

    await expect(
      service.verifyEmail(suppliedToken ?? issuedToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users[0].emailVerifiedAt).toBeNull();
    expect(emailTokens[0].consumedAt).toBeNull();
  });

  it('重发在频率窗口内静默限流，并在边界到达时撤销旧令牌后发送新令牌', async () => {
    const { service, mail, emailTokens } = createFixture();
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    const genericResponse =
      await service.resendVerification('alice@example.com');
    jest.advanceTimersByTime(59_999);

    await expect(
      service.resendVerification('alice@example.com'),
    ).resolves.toEqual(genericResponse);
    expect(mail.sendVerification).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await expect(
      service.resendVerification(' ALICE@EXAMPLE.COM '),
    ).resolves.toEqual(genericResponse);
    expect(mail.sendVerification).toHaveBeenCalledTimes(2);
    expect(emailTokens).toHaveLength(2);
    expect(emailTokens[0].revokedAt).toEqual(new Date());
    expect(emailTokens[1].tokenHash).not.toBe(
      mail.sendVerification.mock.calls[1][1],
    );
  });

  it('未知、未验证与已验证邮箱收到完全一致的找回响应，且只有已验证账户收到限时链接', async () => {
    const { service, mail, users, passwordResetTokens } = createFixture();
    const unknownResponse = await service.requestPasswordReset(
      'unknown@example.com',
    );
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    const unverifiedResponse =
      await service.requestPasswordReset('alice@example.com');
    users[0].emailVerifiedAt = new Date();
    const verifiedResponse = await service.requestPasswordReset(
      ' ALICE@EXAMPLE.COM ',
    );

    expect(unverifiedResponse).toEqual(unknownResponse);
    expect(verifiedResponse).toEqual(unknownResponse);
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);
    expect(passwordResetTokens).toHaveLength(1);

    const rawToken = mail.sendPasswordReset.mock.calls[0][1] as string;
    expect(passwordResetTokens[0].tokenHash).not.toBe(rawToken);
    expect(passwordResetTokens[0].expiresAt.getTime()).toBe(
      Date.now() + 60 * 60 * 1000,
    );
    expect(JSON.stringify(verifiedResponse)).not.toContain(rawToken);
  });

  it('持久化快照和账户响应都不包含密码或原始邮件令牌', async () => {
    const { service, mail, users, emailTokens, passwordResetTokens } =
      createFixture();
    const password = 'PASSWORD_SENTINEL_83f2';
    const registrationResponse = await service.register({
      email: 'alice@example.com',
      password,
    });
    const verificationToken = mail.sendVerification.mock.calls[0][1] as string;
    await service.verifyEmail(verificationToken);
    const recoveryResponse =
      await service.requestPasswordReset('alice@example.com');
    const resetToken = mail.sendPasswordReset.mock.calls[0][1] as string;
    const persistedSnapshot = JSON.stringify({
      users,
      emailTokens,
      passwordResetTokens,
    });
    const responseSnapshot = JSON.stringify({
      registrationResponse,
      recoveryResponse,
    });

    expect(persistedSnapshot).not.toContain(password);
    expect(persistedSnapshot).not.toContain(verificationToken);
    expect(persistedSnapshot).not.toContain(resetToken);
    expect(responseSnapshot).not.toContain(password);
    expect(responseSnapshot).not.toContain(verificationToken);
    expect(responseSnapshot).not.toContain(resetToken);
  });
});
