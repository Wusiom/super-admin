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

  it.each([
    'postgresql://postgres:postgres@localhost:5432/learning_assistant',
    'postgres://postgres:postgres@localhost:5432/learning_assistant',
  ])('接受 PostgreSQL 数据库地址：%s', (databaseUrl) => {
    expect(
      validateEnvironment({ ...validEnvironment, DATABASE_URL: databaseUrl })
        .DATABASE_URL,
    ).toBe(databaseUrl);
  });
});
