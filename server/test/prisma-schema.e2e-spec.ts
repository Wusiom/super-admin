import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Prisma,
  PrismaClient,
  QuotaMetric,
  SourceAnchorKind,
  SourceType,
} from '@prisma/client';

const serverRoot = resolve(__dirname, '..');
const baselinePath = resolve(
  serverRoot,
  'prisma/migrations/0_postgresql_baseline/migration.sql',
);
const prismaCli = resolve(serverRoot, '../node_modules/prisma/build/index.js');
const JEST_HOOK_TIMEOUT_MS = 30_000;
const MIGRATE_DEPLOY_TIMEOUT_MS = 25_000;
const suiteSchema = `prisma_e2e_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'prisma-schema E2E 必须通过 DATABASE_URL 连接真实 PostgreSQL',
  );
}

if (!/^[a-z0-9_]+$/.test(suiteSchema)) {
  throw new Error(`测试 schema 名不安全：${suiteSchema}`);
}

const isolatedUrl = new URL(databaseUrl);
isolatedUrl.searchParams.set('schema', suiteSchema);
const isolatedDatabaseUrl = isolatedUrl.toString();

const cleanupUrl = new URL(databaseUrl);
cleanupUrl.searchParams.set('schema', 'public');
const cleanupDatabaseUrl = cleanupUrl.toString();

const prisma = new PrismaClient({ datasourceUrl: isolatedDatabaseUrl });
const cleanupPrisma = new PrismaClient({ datasourceUrl: cleanupDatabaseUrl });

function expectForeignKeyViolation(operation: Promise<unknown>) {
  return expect(operation).rejects.toMatchObject<
    Partial<Prisma.PrismaClientKnownRequestError>
  >({
    code: 'P2003',
  });
}

describe('PostgreSQL Prisma 不可变基线', () => {
  beforeAll(async () => {
    const [{ version }] = await prisma.$queryRaw<Array<{ version: string }>>`
        SELECT version()
      `;
    expect(version).toContain('PostgreSQL');
    expect(existsSync(baselinePath)).toBe(true);

    execFileSync(
      process.execPath,
      [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      {
        cwd: serverRoot,
        env: { ...process.env, DATABASE_URL: isolatedDatabaseUrl },
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: MIGRATE_DEPLOY_TIMEOUT_MS,
        windowsHide: true,
      },
    );

    await prisma.$connect();
  }, JEST_HOOK_TIMEOUT_MS);

  afterAll(async () => {
    try {
      // suiteSchema 完全由 randomUUID 生成并已通过白名单校验，不包含外部输入。
      await cleanupPrisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${suiteSchema}" CASCADE`,
      );
    } finally {
      await Promise.allSettled([
        prisma.$disconnect(),
        cleanupPrisma.$disconnect(),
      ]);
    }
  }, JEST_HOOK_TIMEOUT_MS);

  it('可将空数据库迁移到最新 schema', async () => {
    const [{ current_schema: currentSchema }] = await prisma.$queryRaw<
      Array<{ current_schema: string }>
    >`SELECT current_schema()`;
    const migrations = await prisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null }>
    >`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      ORDER BY migration_name
    `;

    expect(currentSchema).toBe(suiteSchema);
    expect(migrations).toEqual([
      expect.objectContaining({
        migration_name: '0_postgresql_baseline',
        finished_at: expect.any(Date),
      }),
    ]);
  });

  it('owner-scoped 业务值可由不同用户分别复用', async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const [user1, user2] = await Promise.all([
      prisma.user.create({
        data: {
          email: `owner-1-${suffix}@example.test`,
          emailNormalized: `owner-1-${suffix}@example.test`,
          passwordHash: 'test-password-hash',
        },
      }),
      prisma.user.create({
        data: {
          email: `owner-2-${suffix}@example.test`,
          emailNormalized: `owner-2-${suffix}@example.test`,
          passwordHash: 'test-password-hash',
        },
      }),
    ]);

    const canonicalUrl = `https://example.test/shared/${suffix}`;
    const strategyKey = `shared-strategy-${suffix}`;
    const idempotencyKey = `shared-job-${suffix}`;

    await Promise.all(
      [user1, user2].flatMap((user) => [
        prisma.learningSource.create({
          data: {
            userId: user.id,
            type: SourceType.WEB,
            title: '共享 URL',
            canonicalUrl,
          },
        }),
        prisma.learnerStrategy.create({
          data: { userId: user.id, strategyKey },
        }),
        prisma.job.create({
          data: {
            userId: user.id,
            toolKey: 'knowledge-capture',
            idempotencyKey,
          },
        }),
        prisma.userQuotaOverride.create({
          data: {
            userId: user.id,
            metric: QuotaMetric.MODEL_TOKENS,
            limit: 1000n,
            reason: 'E2E owner scope',
          },
        }),
      ]),
    );

    await expect(
      Promise.all([
        prisma.learningSource.count({ where: { canonicalUrl } }),
        prisma.learnerStrategy.count({ where: { strategyKey } }),
        prisma.job.count({ where: { idempotencyKey } }),
        prisma.userQuotaOverride.count({
          where: {
            metric: QuotaMetric.MODEL_TOKENS,
            userId: { in: [user1.id, user2.id] },
          },
        }),
      ]),
    ).resolves.toEqual([2, 2, 2, 2]);
  });

  it('拒绝 SourceVersion 跨用户引用 LearningSource', async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const [user1, user2] = await Promise.all([
      prisma.user.create({
        data: {
          email: `fk-owner-1-${suffix}@example.test`,
          emailNormalized: `fk-owner-1-${suffix}@example.test`,
          passwordHash: 'test-password-hash',
        },
      }),
      prisma.user.create({
        data: {
          email: `fk-owner-2-${suffix}@example.test`,
          emailNormalized: `fk-owner-2-${suffix}@example.test`,
          passwordHash: 'test-password-hash',
        },
      }),
    ]);
    const source = await prisma.learningSource.create({
      data: {
        userId: user1.id,
        type: SourceType.WEB,
        title: '用户 1 的来源',
      },
    });

    await expectForeignKeyViolation(
      prisma.sourceVersion.create({
        data: {
          userId: user2.id,
          sourceId: source.id,
          version: 1,
          contentHash: `cross-owner-${suffix}`,
        },
      }),
    );
  });

  it('拒绝跨版本的 ConceptAnchor 关系', async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const user = await prisma.user.create({
      data: {
        email: `anchor-${suffix}@example.test`,
        emailNormalized: `anchor-${suffix}@example.test`,
        passwordHash: 'test-password-hash',
      },
    });
    const source = await prisma.learningSource.create({
      data: { userId: user.id, type: SourceType.WEB, title: '跨版本锚点测试' },
    });
    const [version1, version2] = await Promise.all([
      prisma.sourceVersion.create({
        data: {
          userId: user.id,
          sourceId: source.id,
          version: 1,
          contentHash: `version-1-${suffix}`,
        },
      }),
      prisma.sourceVersion.create({
        data: {
          userId: user.id,
          sourceId: source.id,
          version: 2,
          contentHash: `version-2-${suffix}`,
        },
      }),
    ]);
    const [concept, anchor] = await Promise.all([
      prisma.concept.create({
        data: {
          sourceVersionId: version1.id,
          key: 'concept',
          title: '概念',
          description: '仅属于版本 1',
        },
      }),
      prisma.sourceAnchor.create({
        data: {
          sourceVersionId: version2.id,
          key: 'anchor',
          kind: SourceAnchorKind.PARAGRAPH,
          locator: { paragraph: 1 },
          quote: '仅属于版本 2',
        },
      }),
    ]);

    await expectForeignKeyViolation(
      prisma.conceptAnchor.create({
        data: {
          sourceVersionId: version2.id,
          conceptId: concept.id,
          anchorId: anchor.id,
        },
      }),
    );
  });

  it('硬删除 LearningSource 会级联删除 SourceVersion 及直接内容树', async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const user = await prisma.user.create({
      data: {
        email: `cascade-${suffix}@example.test`,
        emailNormalized: `cascade-${suffix}@example.test`,
        passwordHash: 'test-password-hash',
      },
    });
    const source = await prisma.learningSource.create({
      data: { userId: user.id, type: SourceType.WEB, title: '级联测试来源' },
    });
    const version = await prisma.sourceVersion.create({
      data: {
        userId: user.id,
        sourceId: source.id,
        version: 1,
        contentHash: `cascade-${suffix}`,
      },
    });
    const section = await prisma.sourceSection.create({
      data: {
        sourceVersionId: version.id,
        key: 'section',
        title: '章节',
        position: 1,
      },
    });
    const chunk = await prisma.sourceChunk.create({
      data: {
        sourceVersionId: version.id,
        sectionId: section.id,
        position: 1,
        content: '正文',
        contentHash: `chunk-${suffix}`,
      },
    });
    const anchor = await prisma.sourceAnchor.create({
      data: {
        sourceVersionId: version.id,
        sectionId: section.id,
        chunkId: chunk.id,
        key: 'anchor',
        kind: SourceAnchorKind.PARAGRAPH,
        locator: { paragraph: 1 },
        quote: '正文',
      },
    });
    const concept = await prisma.concept.create({
      data: {
        sourceVersionId: version.id,
        key: 'concept',
        title: '概念',
        description: '直接内容树',
      },
    });

    await prisma.learningSource.delete({ where: { id: source.id } });

    await expect(
      Promise.all([
        prisma.sourceVersion.count({ where: { id: version.id } }),
        prisma.sourceSection.count({ where: { id: section.id } }),
        prisma.sourceChunk.count({ where: { id: chunk.id } }),
        prisma.sourceAnchor.count({ where: { id: anchor.id } }),
        prisma.concept.count({ where: { id: concept.id } }),
      ]),
    ).resolves.toEqual([0, 0, 0, 0, 0]);
  });
});
