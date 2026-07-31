import { validateEnvironment } from './environment';

const validEnvironment = {
  DATABASE_URL: 'file:./dev.db',
  JWT_ACCESS_SECRET: 'local-jwt-access-secret-at-least-32-chars',
  TOKEN_ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_BUCKET: 'learning-assistant',
  OBJECT_STORAGE_ACCESS_KEY: 'local-access-key',
  OBJECT_STORAGE_SECRET_KEY: 'local-secret-key',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  SMTP_FROM: 'noreply@example.test',
  APP_PUBLIC_URL: 'http://localhost:5173',
};

describe('validateEnvironment', () => {
  describe.each([
    ['缺失 DATABASE_URL', 'DATABASE_URL', undefined],
    ['拒绝不支持的 DATABASE_URL 协议', 'DATABASE_URL', 'mysql://localhost/app'],
    ['拒绝无法解析的 DATABASE_URL', 'DATABASE_URL', 'postgresql://'],
    ['缺失 JWT_ACCESS_SECRET', 'JWT_ACCESS_SECRET', undefined],
    ['拒绝过短的 JWT_ACCESS_SECRET', 'JWT_ACCESS_SECRET', 'too-short'],
    ['缺失 TOKEN_ENCRYPTION_KEY', 'TOKEN_ENCRYPTION_KEY', undefined],
    [
      '拒绝非 64 位的 TOKEN_ENCRYPTION_KEY',
      'TOKEN_ENCRYPTION_KEY',
      'ab'.repeat(31),
    ],
    [
      '拒绝非十六进制 TOKEN_ENCRYPTION_KEY',
      'TOKEN_ENCRYPTION_KEY',
      'z'.repeat(64),
    ],
    ['拒绝超出范围的 REDIS_PORT', 'REDIS_PORT', '70000'],
    ['拒绝非整数 REDIS_PORT', 'REDIS_PORT', '63.79'],
    ['拒绝非法对象存储 URL', 'OBJECT_STORAGE_ENDPOINT', 'localhost:9000'],
    ['缺失对象存储桶', 'OBJECT_STORAGE_BUCKET', undefined],
    ['拒绝非法对象存储桶', 'OBJECT_STORAGE_BUCKET', 'Invalid_Bucket'],
    ['缺失对象存储访问凭据', 'OBJECT_STORAGE_ACCESS_KEY', undefined],
    ['缺失对象存储秘密凭据', 'OBJECT_STORAGE_SECRET_KEY', undefined],
    ['缺失 SMTP 主机', 'SMTP_HOST', undefined],
    ['拒绝超出范围的 SMTP_PORT', 'SMTP_PORT', '0'],
    ['拒绝非法 SMTP_SECURE', 'SMTP_SECURE', 'sometimes'],
    ['拒绝非法 SMTP 发件地址', 'SMTP_FROM', 'not-an-email'],
    ['缺失 APP_PUBLIC_URL', 'APP_PUBLIC_URL', undefined],
    [
      '拒绝非 HTTP(S) 的 APP_PUBLIC_URL',
      'APP_PUBLIC_URL',
      'ftp://example.test',
    ],
  ])('%s', (_name, field, value) => {
    it(`错误信息定位到 ${field}`, () => {
      const raw: Record<string, unknown> = {
        ...validEnvironment,
        [field]: value,
      };

      if (value === undefined) {
        delete raw[field];
      }

      expect(() => validateEnvironment(raw)).toThrow(field);
    });
  });

  it('接受合法本地配置并显式转换数字与布尔值', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment).toMatchObject({
      DATABASE_URL: 'file:./dev.db',
      REDIS_PORT: 6379,
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
    });
  });

  it('显式允许本地 Mailpit 不配置 SMTP 认证', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment.SMTP_USER).toBeUndefined();
    expect(environment.SMTP_PASSWORD).toBeUndefined();
  });

  it('接受成对的 SMTP 用户名和密码', () => {
    const environment = validateEnvironment({
      ...validEnvironment,
      SMTP_USER: 'smtp-user',
      SMTP_PASSWORD: 'smtp-password',
    });

    expect(environment).toMatchObject({
      SMTP_USER: 'smtp-user',
      SMTP_PASSWORD: 'smtp-password',
    });
  });

  it.each([
    ['只有用户名', { SMTP_USER: 'smtp-user' }, 'SMTP_PASSWORD', 'smtp-user'],
    [
      '只有密码',
      { SMTP_PASSWORD: 'SMTP_PASSWORD_SENTINEL_9f21' },
      'SMTP_USER',
      'SMTP_PASSWORD_SENTINEL_9f21',
    ],
  ])(
    '拒绝%s的 SMTP 认证配置且不泄露凭据',
    (_name, credentials, missingField, sentinel) => {
      let capturedError: unknown;
      try {
        validateEnvironment({ ...validEnvironment, ...credentials });
      } catch (error) {
        capturedError = error;
      }

      expect(capturedError).toBeInstanceOf(Error);
      const message = (capturedError as Error).message;
      expect(message).toContain(missingField);
      expect(message).not.toContain(sentinel);
    },
  );

  it.each([
    'postgresql://postgres:postgres@localhost:5432/learning_assistant',
    'postgres://postgres:postgres@localhost:5432/learning_assistant',
  ])('接受 PostgreSQL 数据库地址：%s', (databaseUrl) => {
    expect(
      validateEnvironment({ ...validEnvironment, DATABASE_URL: databaseUrl })
        .DATABASE_URL,
    ).toBe(databaseUrl);
  });

  it.each([
    ['空主机文件地址', 'file://'],
    ['根目录文件地址', 'file:/'],
    ['当前目录文件地址', 'file:.'],
    ['当前目录结尾的文件地址', 'file:./'],
    ['父目录结尾的文件地址', 'file:../'],
    ['父目录本身的文件地址', 'file:..'],
    ['只有查询参数的文件地址', 'file:?connection_limit=1'],
    ['只有片段的文件地址', 'file:#fragment'],
    ['反斜杠目录结尾的文件地址', 'file:.\\data\\'],
    ['仅含空白的文件路径', 'file:   '],
    [
      '缺少数据库路径的 postgresql 地址',
      'postgresql://postgres@localhost:5432',
    ],
    ['只有根路径的 postgres 地址', 'postgres://postgres@localhost:5432/'],
    ['带前导空白的文件地址', ' file:./dev.db'],
    ['带尾随空白的文件地址', 'file:./dev.db '],
    [
      '带前导空白的 PostgreSQL 地址',
      ' postgresql://postgres@localhost:5432/learning_assistant',
    ],
    [
      '带尾随空白的 PostgreSQL 地址',
      'postgresql://postgres@localhost:5432/learning_assistant ',
    ],
  ])('拒绝非法 DATABASE_URL：%s', (_name, databaseUrl) => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: databaseUrl,
      }),
    ).toThrow('DATABASE_URL');
  });

  it.each([
    'file:./dev.db',
    'file:/app/data/dev.db',
    'file:../data/dev.db',
    'file:./dev.db?connection_limit=1',
  ])('接受包含具体 SQLite 文件的 DATABASE_URL：%s', (databaseUrl) => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: databaseUrl,
      }).DATABASE_URL,
    ).toBe(databaseUrl);
  });

  it.each([
    ['JWT_ACCESS_SECRET', ' '.repeat(32)],
    ['JWT_ACCESS_SECRET', ` ${validEnvironment.JWT_ACCESS_SECRET}`],
    ['JWT_ACCESS_SECRET', `${validEnvironment.JWT_ACCESS_SECRET} `],
    ['OBJECT_STORAGE_ACCESS_KEY', ' '],
    ['OBJECT_STORAGE_ACCESS_KEY', '   '],
    ['OBJECT_STORAGE_ACCESS_KEY', ' local-access-key'],
    ['OBJECT_STORAGE_ACCESS_KEY', 'local-access-key '],
    ['OBJECT_STORAGE_SECRET_KEY', ' '],
    ['OBJECT_STORAGE_SECRET_KEY', '   '],
    ['OBJECT_STORAGE_SECRET_KEY', ' local-secret-key'],
    ['OBJECT_STORAGE_SECRET_KEY', 'local-secret-key '],
  ])('拒绝空白或首尾空白秘密：%s', (field, value) => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        [field]: value,
      }),
    ).toThrow(field);
  });

  it.each(['foo..bar', 'foo.-bar', 'foo-.bar', '192.168.1.1'])(
    '拒绝非法 S3 存储桶名称：%s',
    (bucket) => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          OBJECT_STORAGE_BUCKET: bucket,
        }),
      ).toThrow('OBJECT_STORAGE_BUCKET');
    },
  );

  it.each(['learning-assistant.test', 'learning-assistant'])(
    '接受合法 S3 存储桶名称：%s',
    (bucket) => {
      expect(
        validateEnvironment({
          ...validEnvironment,
          OBJECT_STORAGE_BUCKET: bucket,
        }).OBJECT_STORAGE_BUCKET,
      ).toBe(bucket);
    },
  );

  it.each([
    {
      field: 'JWT_ACCESS_SECRET',
      sentinel: 'JWT_SECRET_SENTINEL_7d91',
      value: 'JWT_SECRET_SENTINEL_7d91',
    },
    {
      field: 'TOKEN_ENCRYPTION_KEY',
      sentinel: 'TOKEN_KEY_SENTINEL_f4c2',
      value: 'TOKEN_KEY_SENTINEL_f4c2',
    },
    {
      field: 'OBJECT_STORAGE_ACCESS_KEY',
      sentinel: 'STORAGE_ACCESS_SENTINEL_18a6',
      value: { marker: 'STORAGE_ACCESS_SENTINEL_18a6' },
    },
    {
      field: 'OBJECT_STORAGE_SECRET_KEY',
      sentinel: 'STORAGE_SECRET_SENTINEL_c305',
      value: { marker: 'STORAGE_SECRET_SENTINEL_c305' },
    },
  ])(
    '$field 校验失败时不在错误中泄露秘密原值',
    ({ field, sentinel, value }) => {
      const raw: Record<string, unknown> = {
        ...validEnvironment,
        [field]: value,
      };
      const completeValue =
        typeof value === 'string' ? value : JSON.stringify(value);

      let capturedError: unknown;
      try {
        validateEnvironment(raw);
      } catch (error) {
        capturedError = error;
      }

      expect(capturedError).toBeInstanceOf(Error);
      const message = (capturedError as Error).message;
      expect(message).toContain(field);
      expect(message).not.toContain(sentinel);
      expect(message).not.toContain(completeValue);
    },
  );
});
