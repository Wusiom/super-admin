import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

type ComposeService = {
  image?: string;
  environment?: Record<string, string>;
  healthcheck?: { test?: string[]; interval?: string };
  depends_on?: Record<string, { condition?: string; required?: boolean }>;
  entrypoint?: string[];
  profiles?: string[];
  volumes?: string[];
  tmpfs?: string[] | string;
  ports?: Array<
    | string
    | {
        host_ip?: string;
        published?: string;
        target?: number;
        protocol?: string;
      }
  >;
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

function readServiceSource(fileName: string, serviceName: string): string {
  const source = readFileSync(resolve(projectRoot, fileName), 'utf8');
  const escapedName = serviceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(
    new RegExp(
      `^  ${escapedName}:\\r?\\n([\\s\\S]*?)(?=^  [a-z][\\w-]*:\\r?$|^volumes:\\r?$|(?![\\s\\S]))`,
      'm',
    ),
  );

  if (!match) {
    throw new Error(`Compose 服务不存在：${serviceName}`);
  }

  return match[0];
}

function hasDockerCompose(): boolean {
  try {
    execFileSync('docker', ['compose', 'version'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function readMergedCompose(): ComposeDocument {
  const output = execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.yml',
      '-f',
      'docker-compose.test.yml',
      'config',
      '--format',
      'json',
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        POSTGRES_PASSWORD: 'test-postgres-password',
        MINIO_ROOT_USER: 'test-minio-access-key',
        MINIO_ROOT_PASSWORD: 'test-minio-secret-key',
        OBJECT_STORAGE_ACCESS_KEY: 'test-app-access-key',
        OBJECT_STORAGE_SECRET_KEY: 'test-app-secret-key',
        JWT_ACCESS_SECRET: 'test-jwt-access-secret-at-least-32-characters',
        TOKEN_ENCRYPTION_KEY:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        TEST_POSTGRES_PORT: '15432',
        TEST_CLIENT_PORT: '18080',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );

  return JSON.parse(output) as ComposeDocument;
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

  it('server 等待 PostgreSQL、Redis、MinIO 健康且建桶完成后再启动', () => {
    expect(compose.services.server.depends_on).toMatchObject({
      postgres: { condition: 'service_healthy' },
      redis: { condition: 'service_healthy' },
      minio: { condition: 'service_healthy' },
      'minio-init': { condition: 'service_completed_successfully' },
    });
  });

  it('client 等待 server 健康后再启动', () => {
    expect(compose.services.client.depends_on).toMatchObject({
      server: { condition: 'service_healthy' },
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

  it('主配置只向宿主机发布 client 端口', () => {
    for (const serviceName of [
      'postgres',
      'redis',
      'minio',
      'mailpit',
      'server',
    ]) {
      expect(compose.services[serviceName].ports ?? []).toEqual([]);
    }
    expect(compose.services.client.ports).toEqual(['${CLIENT_PORT:-80}:80']);
  });

  it('server 使用独立对象存储凭据，MinIO 初始化创建桶级应用用户与策略', () => {
    expect(compose.services.server.environment).toMatchObject({
      OBJECT_STORAGE_ACCESS_KEY:
        '${OBJECT_STORAGE_ACCESS_KEY:?请在 .env 中设置 OBJECT_STORAGE_ACCESS_KEY}',
      OBJECT_STORAGE_SECRET_KEY:
        '${OBJECT_STORAGE_SECRET_KEY:?请在 .env 中设置 OBJECT_STORAGE_SECRET_KEY}',
    });
    expect(JSON.stringify(compose.services.server.environment)).not.toContain(
      'MINIO_ROOT',
    );
    expect(compose.services['minio-init'].environment).toMatchObject({
      OBJECT_STORAGE_ACCESS_KEY:
        '${OBJECT_STORAGE_ACCESS_KEY:?请在 .env 中设置 OBJECT_STORAGE_ACCESS_KEY}',
      OBJECT_STORAGE_SECRET_KEY:
        '${OBJECT_STORAGE_SECRET_KEY:?请在 .env 中设置 OBJECT_STORAGE_SECRET_KEY}',
    });

    const initCommand = compose.services['minio-init'].entrypoint?.at(-1) ?? '';
    expect(initCommand).toContain('mc mb --ignore-existing');
    expect(initCommand).toContain(
      'mc admin user add local "$${OBJECT_STORAGE_ACCESS_KEY}" "$${OBJECT_STORAGE_SECRET_KEY}"',
    );
    expect(initCommand).toContain(
      'mc admin policy create local learning-assistant-app /tmp/learning-assistant-policy.json',
    );
    expect(initCommand).not.toContain('mc admin user info');
    expect(initCommand).not.toContain('mc admin policy info');
    expect(initCommand).toContain('mc admin policy attach');
    expect(initCommand).toContain('arn:aws:s3:::$${OBJECT_STORAGE_BUCKET}');
    expect(initCommand).toContain('arn:aws:s3:::$${OBJECT_STORAGE_BUCKET}/*');
  });

  it('.env.example 的 Compose 默认 SMTP 主机指向 Mailpit', () => {
    const exampleEnvironment = readFileSync(
      resolve(projectRoot, '.env.example'),
      'utf8',
    );
    expect(exampleEnvironment).toMatch(/^SMTP_HOST=mailpit$/m);
  });

  it('SMTP 配置可由环境覆盖，生产覆盖禁用 Mailpit 强依赖', () => {
    expect(compose.services.server.environment).toMatchObject({
      SMTP_HOST: '${SMTP_HOST:-mailpit}',
      SMTP_PORT: '${SMTP_PORT:-1025}',
      SMTP_SECURE: '${SMTP_SECURE:-false}',
      SMTP_FROM: '${SMTP_FROM:-noreply@example.test}',
    });

    const productionPath = resolve(
      projectRoot,
      'docker-compose.production.yml',
    );
    expect(existsSync(productionPath)).toBe(true);
    if (!existsSync(productionPath)) {
      return;
    }

    const production = readCompose('docker-compose.production.yml');
    expect(production.services.mailpit.profiles).toEqual(['local-mailpit']);
    expect(production.services.server.depends_on?.mailpit).toMatchObject({
      condition: 'service_healthy',
      required: false,
    });
    expect(production.services.server.environment).toMatchObject({
      SMTP_HOST: '${SMTP_HOST:?生产环境必须设置 SMTP_HOST}',
      SMTP_PORT: '${SMTP_PORT:?生产环境必须设置 SMTP_PORT}',
      SMTP_SECURE: '${SMTP_SECURE:?生产环境必须设置 SMTP_SECURE}',
      SMTP_FROM: '${SMTP_FROM:?生产环境必须设置 SMTP_FROM}',
    });
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

    it('使用显式非生产凭据，仅通过回环暴露 PostgreSQL，其他配套服务不暴露', () => {
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

      expect(testCompose.services.postgres.ports).toEqual([
        '127.0.0.1:${TEST_POSTGRES_PORT:-15432}:5432',
      ]);

      for (const serviceName of ['redis', 'minio', 'mailpit']) {
        expect(testCompose.services[serviceName].ports).toEqual([]);
      }
    });

    it('静态覆盖标签位于对应服务的端口和数据卷字段', () => {
      const postgresSource = readServiceSource(
        'docker-compose.test.yml',
        'postgres',
      );
      expect(postgresSource).toMatch(/^    volumes: !reset \[\]$/m);
      expect(postgresSource).toMatch(/^    ports: !override$/m);

      for (const serviceName of ['redis', 'minio']) {
        const serviceSource = readServiceSource(
          'docker-compose.test.yml',
          serviceName,
        );
        expect(serviceSource).toMatch(/^    volumes: !reset \[\]$/m);
        expect(serviceSource).toMatch(/^    ports: !reset \[\]$/m);
      }

      for (const serviceName of ['mailpit', 'server']) {
        expect(
          readServiceSource('docker-compose.test.yml', serviceName),
        ).toMatch(/^    ports: !reset \[\]$/m);
      }
      expect(readServiceSource('docker-compose.test.yml', 'client')).toMatch(
        /^    ports: !override$/m,
      );
    });

    const realMergeTest = hasDockerCompose() ? it : it.skip;
    realMergeTest('使用 Docker Compose 真实合并语义隔离端口和状态数据', () => {
      const previousPostgresPort = process.env.TEST_POSTGRES_PORT;
      const previousClientPort = process.env.TEST_CLIENT_PORT;
      process.env.TEST_POSTGRES_PORT = '25432';
      process.env.TEST_CLIENT_PORT = '28080';
      let merged: ComposeDocument;
      try {
        merged = readMergedCompose();
      } finally {
        if (previousPostgresPort === undefined) {
          delete process.env.TEST_POSTGRES_PORT;
        } else {
          process.env.TEST_POSTGRES_PORT = previousPostgresPort;
        }
        if (previousClientPort === undefined) {
          delete process.env.TEST_CLIENT_PORT;
        } else {
          process.env.TEST_CLIENT_PORT = previousClientPort;
        }
      }

      for (const serviceName of ['postgres', 'redis', 'minio']) {
        const service = merged.services[serviceName];
        expect(service.volumes ?? []).toEqual([]);
        expect(service.tmpfs).toBeDefined();
      }

      expect(merged.services.postgres.ports).toEqual([
        expect.objectContaining({
          host_ip: '127.0.0.1',
          published: '15432',
          target: 5432,
          protocol: 'tcp',
        }),
      ]);
      for (const serviceName of ['redis', 'minio']) {
        expect(merged.services[serviceName].ports ?? []).toEqual([]);
      }

      for (const serviceName of ['mailpit', 'server']) {
        expect(merged.services[serviceName].ports ?? []).toEqual([]);
      }

      expect(merged.services.client.ports).toEqual([
        expect.objectContaining({
          host_ip: '127.0.0.1',
          published: '18080',
          target: 80,
          protocol: 'tcp',
        }),
      ]);
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
