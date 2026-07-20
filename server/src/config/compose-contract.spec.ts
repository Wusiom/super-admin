import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

type ComposeService = {
  image?: string;
  environment?: Record<string, string>;
  healthcheck?: { test?: string[]; interval?: string };
  depends_on?: Record<string, { condition?: string }>;
  volumes?: string[];
  tmpfs?: string[] | string;
  ports?: string[];
};

type ComposeDocument = {
  services: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
};

const projectRoot = resolve(__dirname, '../../..');

function readCompose(fileName: string): ComposeDocument {
  const source = readFileSync(resolve(projectRoot, fileName), 'utf8');

  // Docker Compose 的 !reset / !override 是 YAML 扩展标签；契约测试只关心其值。
  return parse(source.replace(/!(?:reset|override)\b/g, '')) as ComposeDocument;
}

describe('Docker Compose 契约', () => {
  const compose = readCompose('docker-compose.yml');

  it('声明应用及全部配套服务，并固定 PostgreSQL 与 Redis 主版本', () => {
    expect(Object.keys(compose.services)).toEqual(
      expect.arrayContaining([
        'postgres',
        'redis',
        'minio',
        'mailpit',
        'server',
        'client',
      ]),
    );
    expect(compose.services.postgres.image).toMatch(/^postgres:16(?:\.|-)/);
    expect(compose.services.redis.image).toMatch(/^redis:7(?:\.|-)/);
  });

  it.each(['postgres', 'redis', 'minio', 'mailpit', 'server', 'client'])(
    '%s 服务提供健康检查',
    (serviceName) => {
      expect(compose.services[serviceName].healthcheck?.test).toBeDefined();
    },
  );

  it('server 等待 PostgreSQL、Redis 与 MinIO 健康后再启动', () => {
    expect(compose.services.server.depends_on).toMatchObject({
      postgres: { condition: 'service_healthy' },
      redis: { condition: 'service_healthy' },
      minio: { condition: 'service_healthy' },
    });
  });

  it('server 透传 Task 2 要求的全部运行时环境变量', () => {
    expect(Object.keys(compose.services.server.environment ?? {})).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'JWT_ACCESS_SECRET',
        'TOKEN_ENCRYPTION_KEY',
        'REDIS_HOST',
        'REDIS_PORT',
        'OBJECT_STORAGE_ENDPOINT',
        'OBJECT_STORAGE_BUCKET',
        'OBJECT_STORAGE_ACCESS_KEY',
        'OBJECT_STORAGE_SECRET_KEY',
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_SECURE',
        'SMTP_FROM',
        'APP_PUBLIC_URL',
      ]),
    );
    expect(compose.services.server.environment?.DATABASE_URL).toMatch(
      /^postgresql:\/\//,
    );
  });

  it('持久化 PostgreSQL、Redis 与 MinIO 数据', () => {
    expect(Object.keys(compose.volumes ?? {})).toEqual(
      expect.arrayContaining(['postgres-data', 'redis-data', 'minio-data']),
    );
  });

  describe('测试覆盖', () => {
    const testCompose = readCompose('docker-compose.test.yml');

    it('为状态服务使用临时文件系统并缩短健康检查间隔', () => {
      for (const serviceName of ['postgres', 'redis', 'minio']) {
        expect(testCompose.services[serviceName].tmpfs).toBeDefined();
        expect(testCompose.services[serviceName].healthcheck?.interval).toBe(
          '1s',
        );
      }
    });

    it('使用显式非生产凭据且不暴露配套服务宿主端口', () => {
      expect(testCompose.services.postgres.environment).toMatchObject({
        POSTGRES_DB: 'super_admin_test',
        POSTGRES_USER: 'super_admin_test',
        POSTGRES_PASSWORD: 'test-postgres-password',
      });
      expect(testCompose.services.minio.environment).toMatchObject({
        MINIO_ROOT_USER: 'test-minio-access-key',
        MINIO_ROOT_PASSWORD: 'test-minio-secret-key',
      });
      expect(testCompose.services.server.environment).toMatchObject({
        JWT_ACCESS_SECRET: 'test-jwt-access-secret-at-least-32-characters',
        TOKEN_ENCRYPTION_KEY:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      });

      for (const serviceName of ['postgres', 'redis', 'minio', 'mailpit']) {
        expect(testCompose.services[serviceName].ports).toEqual([]);
      }
    });
  });
});

describe('server Dockerfile 契约', () => {
  const dockerfile = readFileSync(
    resolve(projectRoot, 'server/Dockerfile'),
    'utf8',
  );

  it('构建与运行阶段使用语法有效的 PostgreSQL 地址', () => {
    const databaseUrls = [
      ...dockerfile.matchAll(/^ENV DATABASE_URL=(.+)$/gm),
    ].map(([, value]) => value.replace(/^"|"$/g, ''));

    expect(databaseUrls).toHaveLength(2);
    for (const databaseUrl of databaseUrls) {
      const parsed = new URL(databaseUrl);
      expect(parsed.protocol).toBe('postgresql:');
      expect(parsed.hostname).not.toBe('');
      expect(parsed.pathname).not.toBe('/');
    }
  });

  it('显式重建 argon2 原生模块', () => {
    const rebuildCommands = dockerfile
      .split('\n')
      .filter(
        (line) => line.startsWith('RUN ') && line.includes('pnpm rebuild'),
      );

    expect(rebuildCommands).toHaveLength(2);
    expect(rebuildCommands.every((line) => line.includes(' argon2'))).toBe(
      true,
    );
  });

  it('运行时先部署数据库迁移再启动应用', () => {
    expect(dockerfile).toContain(
      'CMD sh -c "npx prisma migrate deploy && node dist/main"',
    );
  });
});
