import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AccountsService } from './accounts.service';

jest.mock('argon2', () => {
  const actual = jest.requireActual<typeof import('argon2')>('argon2');
  return {
    ...actual,
    verify: jest.fn((digest: string, password: string) =>
      actual.verify(digest, password),
    ),
  };
});

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

type FindTokenArgs = {
  where: {
    userId: number;
    consumedAt?: null;
    revokedAt?: null;
  };
};

type CreateTokenArgs = {
  data: Omit<StoredToken, 'id' | 'createdAt' | 'consumedAt' | 'revokedAt'>;
};

type FindUniqueTokenArgs = {
  where: { tokenHash: string };
};

type UpdateTokensArgs = {
  where: {
    id?: number;
    userId?: number;
    consumedAt?: null;
    revokedAt?: null;
    expiresAt?: { gt: Date };
  };
  data: Partial<StoredToken>;
};

type TokenWithUser = StoredToken & { user: StoredUser | undefined };

type TokenDelegateFake = {
  create: jest.Mock<Promise<StoredToken>, [CreateTokenArgs]>;
  findUnique: jest.Mock<Promise<TokenWithUser | null>, [FindUniqueTokenArgs]>;
  findFirst: jest.Mock<Promise<StoredToken | null>, [FindTokenArgs]>;
  updateMany: jest.Mock<Promise<{ count: number }>, [UpdateTokensArgs]>;
};

type FindUserArgs = {
  where: { emailNormalized?: string; id?: number };
};

type CreateUserArgs = {
  data: Pick<StoredUser, 'email' | 'emailNormalized' | 'passwordHash'>;
};

type UpdateUserArgs = {
  where: { id: number };
  data: Partial<StoredUser>;
};

type UserDelegateFake = {
  findUnique: jest.Mock<Promise<StoredUser | null>, [FindUserArgs]>;
  create: jest.Mock<Promise<StoredUser>, [CreateUserArgs]>;
  update: jest.Mock<Promise<StoredUser>, [UpdateUserArgs]>;
};

type TransactionClientFake = {
  user: UserDelegateFake;
  emailToken: TokenDelegateFake;
  passwordResetToken: TokenDelegateFake;
};

type TransactionOptions = { isolationLevel?: string };
type TransactionOperation =
  | ((transaction: TransactionClientFake) => Promise<unknown>)
  | Promise<unknown>[];
type TransactionMock = jest.Mock<
  Promise<unknown>,
  [TransactionOperation, TransactionOptions?]
>;
type PrismaFake = TransactionClientFake & {
  $transaction: TransactionMock;
};

function createPrismaFake() {
  const users: StoredUser[] = [];
  const emailTokens: StoredToken[] = [];
  const passwordResetTokens: StoredToken[] = [];
  const transactionHooks = {
    beforeUserFindUnique: jest.fn<Promise<void>, [FindUserArgs]>(() =>
      Promise.resolve(),
    ),
    beforeEmailTokenFindFirst: jest.fn<Promise<void>, [FindTokenArgs]>(() =>
      Promise.resolve(),
    ),
    beforePasswordResetTokenFindFirst: jest.fn<Promise<void>, [FindTokenArgs]>(
      () => Promise.resolve(),
    ),
  };

  const tokenDelegate = (
    tokens: StoredToken[],
    visibleUsers: StoredUser[],
    onMutation: () => void = () => undefined,
    beforeFindFirst: (args: FindTokenArgs) => Promise<void> = () =>
      Promise.resolve(),
  ): TokenDelegateFake => ({
    create: jest.fn<Promise<StoredToken>, [CreateTokenArgs]>(({ data }) => {
      const token: StoredToken = {
        id: tokens.length + 1,
        ...data,
        consumedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      };
      tokens.push(token);
      onMutation();
      return Promise.resolve(token);
    }),
    findUnique: jest.fn<Promise<TokenWithUser | null>, [FindUniqueTokenArgs]>(
      ({ where }) => {
        const token = tokens.find(
          (candidate) => candidate.tokenHash === where.tokenHash,
        );
        if (!token) {
          return Promise.resolve(null);
        }

        return Promise.resolve({
          ...token,
          user: visibleUsers.find((user) => user.id === token.userId),
        });
      },
    ),
    findFirst: jest.fn<Promise<StoredToken | null>, [FindTokenArgs]>(
      async (args) => {
        await beforeFindFirst(args);
        const { where } = args;
        return (
          [...tokens]
            .reverse()
            .find(
              (token) =>
                token.userId === where.userId &&
                (where.consumedAt !== null || token.consumedAt === null) &&
                (where.revokedAt !== null || token.revokedAt === null),
            ) ?? null
        );
      },
    ),
    updateMany: jest.fn<Promise<{ count: number }>, [UpdateTokensArgs]>(
      ({ where, data }) => {
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
            onMutation();
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    ),
  });

  const createUserDelegate = (
    visibleUsers: StoredUser[],
    onMutation: () => void = () => undefined,
    beforeFindUnique: (args: FindUserArgs) => Promise<void> = () =>
      Promise.resolve(),
  ): UserDelegateFake => ({
    findUnique: jest.fn<Promise<StoredUser | null>, [FindUserArgs]>(
      async (args) => {
        await beforeFindUnique(args);
        const { where } = args;
        return (
          visibleUsers.find(
            (user) =>
              (where.emailNormalized === undefined ||
                user.emailNormalized === where.emailNormalized) &&
              (where.id === undefined || user.id === where.id),
          ) ?? null
        );
      },
    ),
    create: jest.fn<Promise<StoredUser>, [CreateUserArgs]>(({ data }) => {
      if (
        visibleUsers.some(
          (user) => user.emailNormalized === data.emailNormalized,
        )
      ) {
        return Promise.reject(
          Object.assign(new Error('unique constraint'), {
            code: 'P2002',
          }),
        );
      }
      const now = new Date();
      const user: StoredUser = {
        id: visibleUsers.length + 1,
        ...data,
        displayName: null,
        role: 'USER',
        status: 'ACTIVE',
        emailVerifiedAt: null,
        disabledAt: null,
        createdAt: now,
        updatedAt: now,
      };
      visibleUsers.push(user);
      onMutation();
      return Promise.resolve(user);
    }),
    update: jest.fn<Promise<StoredUser>, [UpdateUserArgs]>(
      ({ where, data }) => {
        const user = visibleUsers.find(
          (candidate) => candidate.id === where.id,
        );
        if (!user) {
          return Promise.reject(new Error('user not found'));
        }
        Object.assign(user, data);
        onMutation();
        return Promise.resolve(user);
      },
    ),
  });

  const userDelegate = createUserDelegate(users);
  const emailTokenDelegate = tokenDelegate(emailTokens, users);
  const passwordResetTokenDelegate = tokenDelegate(passwordResetTokens, users);
  const transactionClient: TransactionClientFake = {
    user: createUserDelegate(
      users,
      () => undefined,
      transactionHooks.beforeUserFindUnique,
    ),
    emailToken: tokenDelegate(
      emailTokens,
      users,
      () => undefined,
      transactionHooks.beforeEmailTokenFindFirst,
    ),
    passwordResetToken: passwordResetTokenDelegate,
  };
  let databaseVersion = 0;
  const transaction: TransactionMock = jest.fn(async (operation, options) => {
    if (typeof operation === 'function') {
      if (options?.isolationLevel !== 'Serializable') {
        const result = await operation(transactionClient);
        databaseVersion += 1;
        return result;
      }

      const startVersion = databaseVersion;
      const localUsers = users.map((user) => ({ ...user }));
      const localEmailTokens = emailTokens.map((token) => ({ ...token }));
      const localPasswordResetTokens = passwordResetTokens.map((token) => ({
        ...token,
      }));
      let mutated = false;
      const markMutated = () => {
        mutated = true;
      };
      const isolatedClient: TransactionClientFake = {
        user: createUserDelegate(
          localUsers,
          markMutated,
          transactionHooks.beforeUserFindUnique,
        ),
        emailToken: tokenDelegate(
          localEmailTokens,
          localUsers,
          markMutated,
          transactionHooks.beforeEmailTokenFindFirst,
        ),
        passwordResetToken: tokenDelegate(
          localPasswordResetTokens,
          localUsers,
          markMutated,
          transactionHooks.beforePasswordResetTokenFindFirst,
        ),
      };
      const result = await operation(isolatedClient);
      if (mutated && startVersion !== databaseVersion) {
        throw Object.assign(new Error('serialization conflict'), {
          code: 'P2034',
        });
      }
      if (mutated) {
        users.splice(0, users.length, ...localUsers);
        emailTokens.splice(0, emailTokens.length, ...localEmailTokens);
        passwordResetTokens.splice(
          0,
          passwordResetTokens.length,
          ...localPasswordResetTokens,
        );
        databaseVersion += 1;
      }
      return result;
    }
    return Promise.all(operation);
  });
  const prisma: PrismaFake = {
    ...transactionClient,
    user: userDelegate,
    emailToken: emailTokenDelegate,
    $transaction: transaction,
  };

  return {
    prisma,
    transactionClient,
    transactionHooks,
    users,
    emailTokens,
    passwordResetTokens,
  };
}

function createFixture() {
  const database = createPrismaFake();
  const sendVerification = jest
    .fn<Promise<void>, [string, string]>()
    .mockResolvedValue(undefined);
  const sendPasswordReset = jest
    .fn<Promise<void>, [string, string]>()
    .mockResolvedValue(undefined);
  const dispatchVerification = jest.fn<void, [string, string]>(
    (email, token) => {
      void sendVerification(email, token).catch(() => undefined);
    },
  );
  const dispatchPasswordReset = jest.fn<void, [string, string]>(
    (email, token) => {
      void sendPasswordReset(email, token).catch(() => undefined);
    },
  );
  const mail = {
    sendVerification,
    sendPasswordReset,
    dispatchVerification,
    dispatchPasswordReset,
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

  it('注册事务提交后邮件失败仍返回成功且保留可重发账户', async () => {
    const { service, mail, users, emailTokens } = createFixture();
    mail.sendVerification.mockRejectedValueOnce(
      new Error('SMTP_RESPONSE_SENTINEL'),
    );

    await expect(
      service.register({
        email: 'alice@example.com',
        password: 'Correct-Horse-Battery-Staple-42',
      }),
    ).resolves.toEqual({
      message: '注册成功，请检查邮箱完成验证。',
    });
    expect(users).toHaveLength(1);
    expect(emailTokens).toHaveLength(1);
    expect(mail.dispatchVerification).toHaveBeenCalledTimes(1);
  });

  it('邮箱验证前即使密码正确也拒绝认证', async () => {
    const { service } = createFixture();
    const password = 'Correct-Horse-Battery-Staple-42';
    await service.register({ email: 'alice@example.com', password });

    await expect(
      service.authenticate('alice@example.com', password),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('存在与不存在账户都执行一次真实 Argon2id 验证并返回统一 Unauthorized', async () => {
    const { service } = createFixture();
    const password = 'Submitted-Password-Sentinel-42';
    await service.register({
      email: 'alice@example.com',
      password: 'Stored-Password-Sentinel-84',
    });
    const verify = jest.mocked(argon2.verify);
    verify.mockClear();

    await expect(
      service.authenticate('alice@example.com', password),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.authenticate('unknown@example.com', password),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls.map(([digest]) => digest)).toEqual([
      expect.stringMatching(/^\$argon2id\$/u),
      expect.stringMatching(/^\$argon2id\$/u),
    ]);
    expect(verify.mock.calls.map(([, submitted]) => submitted)).toEqual([
      password,
      password,
    ]);
  });

  it('验证成功后允许使用正确密码认证且不返回密码哈希', async () => {
    const { service, mail } = createFixture();
    const password = 'Correct-Horse-Battery-Staple-42';
    await service.register({ email: 'alice@example.com', password });
    const rawToken = mail.sendVerification.mock.calls[0][1];
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
    const rawToken = mail.sendVerification.mock.calls[0][1];

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
    const issuedToken = mail.sendVerification.mock.calls[0][1];
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

  it('重发公开响应不等待 SMTP Promise 完成', async () => {
    const { service, mail } = createFixture();
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    jest.advanceTimersByTime(60_000);

    let markSendStarted: () => void = () => undefined;
    const sendStarted = new Promise<void>((resolve) => {
      markSendStarted = resolve;
    });
    let finishSend: () => void = () => undefined;
    const delayedSend = new Promise<void>((resolve) => {
      finishSend = resolve;
    });
    mail.sendVerification.mockImplementationOnce(() => {
      markSendStarted();
      return delayedSend;
    });
    let responseSettled = false;
    const response = service
      .resendVerification('alice@example.com')
      .then((value) => {
        responseSettled = true;
        return value;
      });

    await sendStarted;
    await Promise.resolve();
    await Promise.resolve();
    const settledBeforeSmtp = responseSettled;
    finishSend();
    await response;

    expect(settledBeforeSmtp).toBe(true);
  });

  it('两个并发重发请求在边界到达时只签发并发送一个新令牌', async () => {
    const { service, mail, transactionHooks, emailTokens } = createFixture();
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    jest.advanceTimersByTime(60_000);

    let concurrentReads = 0;
    let releaseReads: () => void = () => undefined;
    const bothReadsStarted = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    transactionHooks.beforeEmailTokenFindFirst.mockImplementation(async () => {
      concurrentReads += 1;
      if (concurrentReads === 2) {
        releaseReads();
      }
      await bothReadsStarted;
    });

    const responses = await Promise.all([
      service.resendVerification('alice@example.com'),
      service.resendVerification(' ALICE@EXAMPLE.COM '),
    ]);

    expect(responses[0]).toEqual(responses[1]);
    expect(emailTokens).toHaveLength(2);
    expect(
      emailTokens.filter(
        (token) => token.consumedAt === null && token.revokedAt === null,
      ),
    ).toHaveLength(1);
    expect(mail.sendVerification).toHaveBeenCalledTimes(2);
  });

  it('邮箱验证与重发竞争时，验证成功后不再签发或派发新令牌', async () => {
    const { service, mail, transactionHooks, users, emailTokens } =
      createFixture();
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    const verificationToken = mail.sendVerification.mock.calls[0][1];
    mail.dispatchVerification.mockClear();
    jest.advanceTimersByTime(60_000);

    let markTransactionReadStarted: () => void = () => undefined;
    const transactionReadStarted = new Promise<void>((resolve) => {
      markTransactionReadStarted = resolve;
    });
    let releaseTransactionRead: () => void = () => undefined;
    const transactionReadReleased = new Promise<void>((resolve) => {
      releaseTransactionRead = resolve;
    });
    let readPaused = false;
    const pauseBeforeRead = async (): Promise<void> => {
      if (!readPaused) {
        readPaused = true;
        markTransactionReadStarted();
        await transactionReadReleased;
      }
    };
    transactionHooks.beforeUserFindUnique.mockImplementation(pauseBeforeRead);

    const resend = service.resendVerification('alice@example.com');
    await transactionReadStarted;
    await service.verifyEmail(verificationToken);
    releaseTransactionRead();
    await resend;

    expect(emailTokens).toHaveLength(1);
    expect(emailTokens[0].consumedAt).toEqual(new Date());
    expect(transactionHooks.beforeUserFindUnique).toHaveBeenCalledWith({
      where: { id: users[0]?.id },
    });
    expect(mail.dispatchVerification).not.toHaveBeenCalled();
  });

  it('Serializable 事务遇到一次 P2034 后重试并只发送实际签发的令牌', async () => {
    const { service, mail, prisma, emailTokens } = createFixture();
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    jest.advanceTimersByTime(60_000);

    const runTransaction = prisma.$transaction.getMockImplementation();
    if (!runTransaction) {
      throw new Error('$transaction fake is required');
    }
    let conflicts = 0;
    prisma.$transaction.mockImplementation((operation, options) => {
      if (options?.isolationLevel === 'Serializable' && conflicts === 0) {
        conflicts += 1;
        return Promise.reject(
          Object.assign(new Error('serialization conflict'), {
            code: 'P2034',
          }),
        );
      }
      return runTransaction(operation, options);
    });

    await expect(
      service.resendVerification('alice@example.com'),
    ).resolves.toEqual(await service.resendVerification('unknown@example.com'));
    expect(conflicts).toBe(1);
    expect(emailTokens).toHaveLength(2);
    expect(mail.sendVerification).toHaveBeenCalledTimes(2);
  });

  it('P2034 持续发生时只有限重试并保持通用响应且不发送邮件', async () => {
    const { service, mail, prisma, emailTokens } = createFixture();
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    jest.advanceTimersByTime(60_000);
    prisma.$transaction.mockClear();
    prisma.$transaction.mockRejectedValue(
      Object.assign(new Error('serialization conflict'), { code: 'P2034' }),
    );

    const genericResponse = await service.resendVerification(
      'unknown@example.com',
    );
    await expect(
      service.resendVerification('alice@example.com'),
    ).resolves.toEqual(genericResponse);

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(emailTokens).toHaveLength(1);
    expect(mail.sendVerification).toHaveBeenCalledTimes(1);
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

    const rawToken = mail.sendPasswordReset.mock.calls[0][1];
    expect(passwordResetTokens[0].tokenHash).not.toBe(rawToken);
    expect(passwordResetTokens[0].expiresAt.getTime()).toBe(
      Date.now() + 60 * 60 * 1000,
    );
    expect(JSON.stringify(verifiedResponse)).not.toContain(rawToken);
  });

  it('找回公开响应不等待 SMTP 失败且保持通用响应', async () => {
    const { service, mail, users } = createFixture();
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    users[0].emailVerifiedAt = new Date();

    let markSendStarted: () => void = () => undefined;
    const sendStarted = new Promise<void>((resolve) => {
      markSendStarted = resolve;
    });
    let failSend: () => void = () => undefined;
    const delayedFailure = new Promise<void>((_resolve, reject) => {
      failSend = () => reject(new Error('SMTP failure'));
    });
    mail.sendPasswordReset.mockImplementationOnce(() => {
      markSendStarted();
      return delayedFailure;
    });
    let responseSettled = false;
    const response = service
      .requestPasswordReset('alice@example.com')
      .then((value) => {
        responseSettled = true;
        return value;
      });

    await sendStarted;
    await Promise.resolve();
    await Promise.resolve();
    const settledBeforeSmtpFailure = responseSettled;
    failSend();
    const publicResponse = await response;
    const unknownResponse = await service.requestPasswordReset(
      'unknown@example.com',
    );

    expect(settledBeforeSmtpFailure).toBe(true);
    expect(publicResponse).toEqual(unknownResponse);
  });

  it('两个并发找回请求最多签发一个活动令牌并派发一次邮件', async () => {
    const { service, mail, users, passwordResetTokens } = createFixture();
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    users[0].emailVerifiedAt = new Date();

    const responses = await Promise.all([
      service.requestPasswordReset('alice@example.com'),
      service.requestPasswordReset(' ALICE@EXAMPLE.COM '),
    ]);

    expect(responses[0]).toEqual(responses[1]);
    expect(passwordResetTokens).toHaveLength(1);
    expect(
      passwordResetTokens.filter(
        (token) => token.consumedAt === null && token.revokedAt === null,
      ),
    ).toHaveLength(1);
    expect(mail.dispatchPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('密码找回 Serializable 事务遇到一次 P2034 后重试并只派发实际签发的令牌', async () => {
    const { service, mail, prisma, users, passwordResetTokens } =
      createFixture();
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    users[0].emailVerifiedAt = new Date();
    const runTransaction = prisma.$transaction.getMockImplementation();
    if (!runTransaction) {
      throw new Error('$transaction fake is required');
    }
    let conflicts = 0;
    prisma.$transaction.mockImplementation((operation, options) => {
      if (options?.isolationLevel === 'Serializable' && conflicts === 0) {
        conflicts += 1;
        return Promise.reject(
          Object.assign(new Error('serialization conflict'), {
            code: 'P2034',
          }),
        );
      }
      return runTransaction(operation, options);
    });

    await service.requestPasswordReset('alice@example.com');

    expect(conflicts).toBe(1);
    expect(passwordResetTokens).toHaveLength(1);
    expect(mail.dispatchPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('密码找回持续 P2034 时有限重试、返回通用响应且不派发邮件', async () => {
    const { service, mail, prisma, users, passwordResetTokens } =
      createFixture();
    await service.register({
      email: 'alice@example.com',
      password: 'Correct-Horse-Battery-Staple-42',
    });
    users[0].emailVerifiedAt = new Date();
    prisma.$transaction.mockClear();
    prisma.$transaction.mockRejectedValue(
      Object.assign(new Error('serialization conflict'), { code: 'P2034' }),
    );

    const unknownResponse = await service.requestPasswordReset(
      'unknown@example.com',
    );
    await expect(
      service.requestPasswordReset('alice@example.com'),
    ).resolves.toEqual(unknownResponse);

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(passwordResetTokens).toHaveLength(0);
    expect(mail.dispatchPasswordReset).not.toHaveBeenCalled();
  });

  it('持久化快照和账户响应都不包含密码或原始邮件令牌', async () => {
    const { service, mail, users, emailTokens, passwordResetTokens } =
      createFixture();
    const password = 'PASSWORD_SENTINEL_83f2';
    const registrationResponse = await service.register({
      email: 'alice@example.com',
      password,
    });
    const verificationToken = mail.sendVerification.mock.calls[0][1];
    await service.verifyEmail(verificationToken);
    const recoveryResponse =
      await service.requestPasswordReset('alice@example.com');
    const resetToken = mail.sendPasswordReset.mock.calls[0][1];
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
