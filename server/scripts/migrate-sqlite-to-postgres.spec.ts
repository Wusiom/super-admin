import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  type LegacyIdMap,
  type LegacyJob,
  type LegacyKnowledgeItem,
  type LegacyTool,
  type MigrationJournalEntry,
  type MigrationJournalIdentity,
  type MigrationTarget,
  computeTargetFingerprint,
  computeContentHash,
  migrateSqliteToPostgres,
  parseCliArgs,
  sanitizeCliError,
  sanitizeTargetError,
  parseMigrationJournalRecord,
} from './migrate-sqlite-to-postgres';

const TARGET_URL =
  'postgresql://secret-user:secret-pass@127.0.0.1:5432/import_test?schema=task6';
const ADMIN_EMAIL = 'Admin@Example.COM';

type FixtureOptions = {
  duplicateJobId?: boolean;
  orphanJobId?: boolean;
};

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function createLegacyFixture(
  directory: string,
  options: FixtureOptions = {},
): Promise<string> {
  const path = join(directory, 'legacy.db');
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE Tool (
      id INTEGER PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      route TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE Job (
      id INTEGER PRIMARY KEY,
      toolKey TEXT NOT NULL,
      status TEXT NOT NULL,
      input TEXT,
      output TEXT,
      error TEXT,
      startedAt TEXT,
      completedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ApiToken (
      id INTEGER PRIMARY KEY,
      tokenHash TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE KnowledgeItem (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      source TEXT,
      contentHtml TEXT,
      contentMarkdown TEXT,
      status TEXT NOT NULL,
      capturedAt TEXT NOT NULL,
      jobId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  const createdAt = '2026-07-01T10:00:00.000Z';
  database
    .prepare(
      'INSERT INTO Tool (id, key, name, icon, route, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      7,
      'knowledge-capture',
      '知识采集',
      'Notebook',
      '/knowledge',
      1,
      createdAt,
    );
  const insertJob = database.prepare(
    `INSERT INTO Job
      (id, toolKey, status, input, output, error, startedAt, completedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertJob.run(
    10,
    'knowledge-capture',
    'success',
    '{"url":"https://example.test/article"}',
    '{"knowledgeItemId":20}',
    null,
    createdAt,
    '2026-07-01T10:01:00.000Z',
    createdAt,
    '2026-07-01T10:01:00.000Z',
  );
  insertJob.run(
    11,
    'knowledge-capture',
    'failed',
    '{"url":"https://example.test/article"}',
    null,
    'legacy failure',
    createdAt,
    '2026-07-01T10:02:00.000Z',
    createdAt,
    '2026-07-01T10:02:00.000Z',
  );
  database
    .prepare('INSERT INTO ApiToken (id, tokenHash, createdAt) VALUES (?, ?, ?)')
    .run(3, 'raw-global-token-hash-must-not-migrate', createdAt);

  const insertItem = database.prepare(
    `INSERT INTO KnowledgeItem
      (id, title, url, source, contentHtml, contentMarkdown, status, capturedAt, jobId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertItem.run(
    20,
    '第一篇',
    'https://example.test/article',
    'browser',
    '<article>第一篇</article>',
    '# 第一篇\n正文',
    'ready',
    createdAt,
    options.orphanJobId ? 999 : 10,
    createdAt,
    createdAt,
  );
  insertItem.run(
    21,
    '第二篇',
    'https://example.test/article',
    'browser',
    '<article>第二篇</article>',
    null,
    'ready',
    createdAt,
    options.duplicateJobId ? 10 : 11,
    createdAt,
    createdAt,
  );
  database.close();
  return path;
}

class MemoryTarget implements MigrationTarget {
  readonly journals: MigrationJournalEntry[] = [];
  readonly extraTableCounts: Record<string, number> = {};
  readonly lifecycleEvents: string[] = [];
  readonly lockFingerprints: string[] = [];
  releaseFailure: Error | null = null;
  readonly admins: Array<{
    id: number;
    email: string;
    emailNormalized: string;
    passwordHash: string;
    role: string;
    emailVerifiedAt: Date;
  }> = [];
  readonly tools: Array<LegacyTool & { id: number }> = [];
  readonly jobs: Array<
    LegacyJob & {
      id: number;
      userId: number;
      legacyId: number;
    }
  > = [];
  readonly knowledgeItems: Array<
    LegacyKnowledgeItem & {
      id: number;
      userId: number;
      legacyId: number;
      jobId: number | null;
    }
  > = [];
  readonly learningSources: Array<{
    id: number;
    userId: number;
    type: string;
    canonicalUrl: string | null;
    title: string;
  }> = [];
  readonly sourceVersions: Array<{
    id: number;
    sourceId: number;
    userId: number;
    version: number;
    contentHash: string;
    contentHtml: string | null;
    contentMarkdown: string | null;
  }> = [];
  readonly apiTokens: unknown[] = [];
  writeCalls = 0;

  constructor(private readonly preexistingUsers = 0) {}

  async getTableCounts() {
    this.lifecycleEvents.push('读取目标');
    return {
      User: this.preexistingUsers + this.admins.length,
      Tool: this.tools.length,
      Job: this.jobs.length,
      KnowledgeItem: this.knowledgeItems.length,
      LearningSource: this.learningSources.length,
      SourceVersion: this.sourceVersions.length,
      ApiToken: this.apiTokens.length,
      AuditEvent: this.journals.length,
      ...this.extraTableCounts,
    };
  }

  async acquireMigrationLock(targetFingerprint: string) {
    this.lifecycleEvents.push('获取锁');
    this.lockFingerprints.push(targetFingerprint);
  }

  async releaseMigrationLock() {
    this.lifecycleEvents.push('释放锁');
    if (this.releaseFailure) throw this.releaseFailure;
  }

  async loadMigrationJournal(importKey: string) {
    return this.journals
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.importKey === importKey)
      .map(({ entry, index }) => ({
        id: index + 1,
        result: 'SUCCESS',
        targetId: entry.importKey,
        actorUserId: entry.adminId,
        targetUserId: entry.adminId,
        createdAt: new Date(1_700_000_000_000 + index),
        afterMetadata: entry,
      }));
  }

  private appendJournal(
    adminId: number,
    journal: MigrationJournalIdentity,
    phase: MigrationJournalEntry['phase'],
    cursor: number | null,
    mappings: MigrationJournalEntry['mappings'],
  ) {
    this.journals.push({
      formatVersion: 1,
      ...journal,
      adminId,
      phase,
      cursor,
      mappings,
    });
  }

  async createBootstrap(input: {
    email: string;
    emailNormalized: string;
    passwordHash: string;
    tools: LegacyTool[];
    journal: MigrationJournalIdentity;
  }) {
    this.writeCalls += 1;
    const adminId = 100;
    this.admins.push({
      id: adminId,
      email: input.email,
      emailNormalized: input.emailNormalized,
      passwordHash: input.passwordHash,
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    });
    const tools: Record<string, number> = {};
    for (const tool of input.tools) {
      const id = 200 + this.tools.length;
      this.tools.push({ ...tool, id });
      tools[String(tool.id)] = id;
    }
    this.appendJournal(adminId, input.journal, 'bootstrap', 7, { tools });
    return { adminId, tools };
  }

  async createJobs(
    adminId: number,
    jobs: LegacyJob[],
    journal: MigrationJournalIdentity,
  ) {
    this.writeCalls += 1;
    const ids = jobs.map((job) => {
      const id = 300 + this.jobs.length;
      this.jobs.push({ ...job, id, userId: adminId, legacyId: job.id });
      return { legacyId: job.id, targetId: id };
    });
    this.appendJournal(adminId, journal, 'jobs', jobs.at(-1)?.id ?? null, {
      jobs: Object.fromEntries(
        ids.map(({ legacyId, targetId }) => [String(legacyId), targetId]),
      ),
    });
    return ids;
  }

  async createKnowledgeItems(input: {
    adminId: number;
    journal: MigrationJournalIdentity;
    items: Array<
      LegacyKnowledgeItem & {
        targetJobId: number | null;
        canonicalUrl: string | null;
        contentHash: string;
      }
    >;
  }) {
    this.writeCalls += 1;
    const ids = input.items.map((item) => {
      const knowledgeItemId = 400 + this.knowledgeItems.length;
      const learningSourceId = 500 + this.learningSources.length;
      const sourceVersionId = 600 + this.sourceVersions.length;
      this.knowledgeItems.push({
        ...item,
        id: knowledgeItemId,
        userId: input.adminId,
        legacyId: item.id,
        jobId: item.targetJobId,
      });
      this.learningSources.push({
        id: learningSourceId,
        userId: input.adminId,
        type: 'WEB',
        canonicalUrl: item.canonicalUrl,
        title: item.title,
      });
      this.sourceVersions.push({
        id: sourceVersionId,
        sourceId: learningSourceId,
        userId: input.adminId,
        version: 1,
        contentHash: item.contentHash,
        contentHtml: item.contentHtml,
        contentMarkdown: item.contentMarkdown,
      });
      return {
        legacyId: item.id,
        knowledgeItemId,
        learningSourceId,
        sourceVersionId,
      };
    });
    this.appendJournal(
      input.adminId,
      input.journal,
      'knowledge-items',
      input.items.at(-1)?.id ?? null,
      {
        knowledgeItems: Object.fromEntries(
          ids.map(({ legacyId, knowledgeItemId }) => [
            String(legacyId),
            knowledgeItemId,
          ]),
        ),
        learningSources: Object.fromEntries(
          ids.map(({ legacyId, learningSourceId }) => [
            String(legacyId),
            learningSourceId,
          ]),
        ),
        sourceVersions: Object.fromEntries(
          ids.map(({ legacyId, sourceVersionId }) => [
            String(legacyId),
            sourceVersionId,
          ]),
        ),
      },
    );
    return ids;
  }

  async markCompleted(adminId: number, journal: MigrationJournalIdentity) {
    this.appendJournal(adminId, journal, 'completed', null, {});
  }

  async assertResumeState(
    sidecar: LegacyIdMap,
    snapshot: {
      tools: LegacyTool[];
      jobs: LegacyJob[];
      knowledgeItems: LegacyKnowledgeItem[];
    },
  ) {
    const fail = (label: string): never => {
      throw new Error(`${label} 与 journal/legacy snapshot 不一致`);
    };
    const admin = this.admins.find((row) => row.id === sidecar.initialAdmin.id);
    if (
      !admin ||
      admin.emailNormalized !== sidecar.initialAdmin.emailNormalized ||
      admin.role !== 'ADMIN'
    ) {
      fail('初始管理员');
    }
    const expectedCounts: Record<string, number> = {
      User: 1,
      Tool: Object.keys(sidecar.ids.tools).length,
      Job: Object.keys(sidecar.ids.jobs).length,
      KnowledgeItem: Object.keys(sidecar.ids.knowledgeItems).length,
      LearningSource: Object.keys(sidecar.ids.learningSources).length,
      SourceVersion: Object.keys(sidecar.ids.sourceVersions).length,
      AuditEvent: this.journals.length,
    };
    for (const [table, count] of Object.entries(await this.getTableCounts())) {
      if (count !== (expectedCounts[table] ?? 0)) {
        fail(`表 ${table} 行数`);
      }
    }
    if (this.tools.length !== Object.keys(sidecar.ids.tools).length) {
      fail('Tool 行数');
    }
    for (const legacy of snapshot.tools) {
      const targetId = sidecar.ids.tools[String(legacy.id)];
      if (targetId === undefined) continue;
      const row = this.tools.find((candidate) => candidate.id === targetId);
      if (
        !row ||
        row.key !== legacy.key ||
        row.name !== legacy.name ||
        row.icon !== legacy.icon ||
        row.route !== legacy.route ||
        row.enabled !== legacy.enabled
      ) {
        fail(`Tool legacy ID ${legacy.id}`);
      }
    }
    if (this.jobs.length !== Object.keys(sidecar.ids.jobs).length) {
      fail('Job 行数');
    }
    for (const legacy of snapshot.jobs) {
      const targetId = sidecar.ids.jobs[String(legacy.id)];
      if (targetId === undefined) continue;
      const row = this.jobs.find((candidate) => candidate.id === targetId);
      if (
        !row ||
        row.userId !== sidecar.initialAdmin.id ||
        row.toolKey !== legacy.toolKey ||
        row.status !== legacy.status ||
        row.input !== legacy.input ||
        row.output !== legacy.output ||
        row.error !== legacy.error
      ) {
        fail(`Job legacy ID ${legacy.id}`);
      }
    }
    if (
      this.knowledgeItems.length !==
      Object.keys(sidecar.ids.knowledgeItems).length
    ) {
      fail('KnowledgeItem 行数');
    }
    const seenUrls = new Set<string>();
    for (const legacy of snapshot.knowledgeItems) {
      const targetId = sidecar.ids.knowledgeItems[String(legacy.id)];
      if (targetId === undefined) continue;
      const expectedJobId =
        legacy.jobId === null
          ? null
          : (sidecar.ids.jobs[String(legacy.jobId)] ?? fail('Job 映射'));
      const row = this.knowledgeItems.find(
        (candidate) => candidate.id === targetId,
      );
      if (
        !row ||
        row.userId !== sidecar.initialAdmin.id ||
        row.jobId !== expectedJobId ||
        row.title !== legacy.title ||
        row.url !== legacy.url ||
        row.contentHtml !== legacy.contentHtml ||
        row.contentMarkdown !== legacy.contentMarkdown
      ) {
        fail(`KnowledgeItem legacy ID ${legacy.id}`);
      }
      const canonicalUrl =
        legacy.url.trim() && !seenUrls.has(legacy.url.trim())
          ? legacy.url.trim()
          : null;
      if (canonicalUrl) seenUrls.add(canonicalUrl);
      const sourceId = sidecar.ids.learningSources[String(legacy.id)];
      const source = this.learningSources.find(
        (candidate) => candidate.id === sourceId,
      );
      if (
        !source ||
        source.userId !== sidecar.initialAdmin.id ||
        source.type !== 'WEB' ||
        source.canonicalUrl !== canonicalUrl ||
        source.title !== legacy.title
      ) {
        fail(`LearningSource legacy ID ${legacy.id}`);
      }
      const versionId = sidecar.ids.sourceVersions[String(legacy.id)];
      const version = this.sourceVersions.find(
        (candidate) => candidate.id === versionId,
      );
      if (
        !version ||
        version.userId !== sidecar.initialAdmin.id ||
        version.sourceId !== sourceId ||
        version.version !== 1 ||
        version.contentHash !==
          computeContentHash(legacy.contentMarkdown, legacy.contentHtml)
      ) {
        fail(`SourceVersion legacy ID ${legacy.id}`);
      }
    }
  }

  async disconnect() {}
}

describe('SQLite → PostgreSQL 单向导入', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sqlite-import-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('严格校验 CLI 必需参数并识别 dry-run', () => {
    expect(() => parseCliArgs([])).toThrow('--source');
    expect(() =>
      parseCliArgs(['--source', 'legacy.db', '--target', TARGET_URL]),
    ).toThrow('--initial-admin-email');

    expect(
      parseCliArgs([
        '--source',
        'legacy.db',
        '--target',
        TARGET_URL,
        '--initial-admin-email',
        ADMIN_EMAIL,
        '--dry-run',
      ]),
    ).toMatchObject({
      source: 'legacy.db',
      target: TARGET_URL,
      initialAdminEmail: ADMIN_EMAIL,
      dryRun: true,
    });
  });

  it('清洗参数解析阶段错误中的 PostgreSQL URL 凭据', () => {
    const sanitized = sanitizeCliError(
      `无法使用 ${TARGET_URL}，用户 secret-user，密码 secret-pass`,
    );

    expect(sanitized).not.toContain(TARGET_URL);
    expect(sanitized).not.toContain('secret-user');
    expect(sanitized).not.toContain('secret-pass');
    expect(sanitized).toContain('[已清洗 PostgreSQL URL]');
  });

  it('dry-run 报告计数，且不写源库、目标库或 sidecar', async () => {
    const source = await createLegacyFixture(directory);
    const before = sha256(await readFile(source));
    const target = new MemoryTarget();
    const idMapPath = join(directory, 'id-map.json');

    const report = await migrateSqliteToPostgres(
      {
        source,
        target: TARGET_URL,
        initialAdminEmail: ADMIN_EMAIL,
        dryRun: true,
        idMapPath,
        batchSize: 1,
      },
      { target, hashPassword: async () => 'unused' },
    );

    expect(report.counts).toEqual({
      tools: 1,
      jobs: 2,
      apiTokensSkipped: 1,
      knowledgeItems: 2,
      learningSources: 2,
      sourceVersions: 2,
    });
    expect(report.status).toBe('dry-run');
    expect(target.writeCalls).toBe(0);
    await expect(readFile(idMapPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(sha256(await readFile(source))).toBe(before);
  });

  it('创建初始管理员、保留关联和内容哈希，并跳过旧全局 token', async () => {
    const source = await createLegacyFixture(directory);
    const target = new MemoryTarget();
    const idMapPath = join(directory, 'id-map.json');

    const report = await migrateSqliteToPostgres(
      {
        source,
        target: TARGET_URL,
        initialAdminEmail: ADMIN_EMAIL,
        dryRun: false,
        idMapPath,
        batchSize: 1,
      },
      {
        target,
        hashPassword: async (randomPassword) => {
          expect(randomPassword).toHaveLength(64);
          return '$argon2id$test-hash';
        },
      },
    );

    expect(report.status).toBe('completed');
    expect(target.admins).toEqual([
      expect.objectContaining({
        emailNormalized: 'admin@example.com',
        passwordHash: '$argon2id$test-hash',
        role: 'ADMIN',
        emailVerifiedAt: expect.any(Date),
      }),
    ]);
    expect(target.jobs.map((job) => job.status)).toEqual(['success', 'failed']);
    expect(target.knowledgeItems.map((item) => item.jobId)).toEqual([300, 301]);
    expect(target.apiTokens).toHaveLength(0);
    expect(target.learningSources).toHaveLength(2);
    expect(
      target.learningSources.map((sourceRow) => sourceRow.canonicalUrl),
    ).toEqual(['https://example.test/article', null]);
    expect(target.sourceVersions[0].contentHash).toBe(
      sha256(Buffer.from('# 第一篇\n正文', 'utf8')),
    );
    expect(target.sourceVersions[1].contentHash).toBe(
      sha256(Buffer.from('<article>第二篇</article>', 'utf8')),
    );
    expect(computeContentHash(null, null)).toBe(
      sha256(Buffer.from('', 'utf8')),
    );

    const sidecar = JSON.parse(
      await readFile(idMapPath, 'utf8'),
    ) as LegacyIdMap;
    expect(sidecar.status).toBe('completed');
    expect(sidecar.targetFingerprint).not.toContain('secret');
    expect(JSON.stringify(sidecar)).not.toContain(TARGET_URL);
    expect(sidecar.ids.jobs).toEqual({ '10': 300, '11': 301 });
    expect(sidecar.ids.knowledgeItems).toEqual({ '20': 400, '21': 401 });
  });

  it('在任何写入前拒绝非空目标', async () => {
    const source = await createLegacyFixture(directory);
    const target = new MemoryTarget(1);

    await expect(
      migrateSqliteToPostgres(
        {
          source,
          target: TARGET_URL,
          initialAdminEmail: ADMIN_EMAIL,
          dryRun: false,
          idMapPath: join(directory, 'id-map.json'),
          batchSize: 100,
        },
        { target, hashPassword: async () => '$argon2id$unused' },
      ),
    ).rejects.toThrow('目标 PostgreSQL 含有应用数据');
    expect(target.writeCalls).toBe(0);
  });

  it.each([
    [{ orphanJobId: true }, '不存在的 Job'],
    [{ duplicateJobId: true }, '一对一'],
  ])('预检知识条目关联完整性：%s', async (fixtureOptions, message) => {
    const source = await createLegacyFixture(directory, fixtureOptions);
    const target = new MemoryTarget();

    await expect(
      migrateSqliteToPostgres(
        {
          source,
          target: TARGET_URL,
          initialAdminEmail: ADMIN_EMAIL,
          dryRun: false,
          idMapPath: join(directory, 'id-map.json'),
          batchSize: 100,
        },
        { target, hashPassword: async () => '$argon2id$unused' },
      ),
    ).rejects.toThrow(message);
    expect(target.writeCalls).toBe(0);
  });

  it('批次提交并写入 checkpoint 后可安全续传，完成后重跑不重复写入', async () => {
    const source = await createLegacyFixture(directory);
    const target = new MemoryTarget();
    const idMapPath = join(directory, 'id-map.json');
    let injected = false;

    await expect(
      migrateSqliteToPostgres(
        {
          source,
          target: TARGET_URL,
          initialAdminEmail: ADMIN_EMAIL,
          dryRun: false,
          idMapPath,
          batchSize: 1,
        },
        {
          target,
          hashPassword: async () => '$argon2id$test-hash',
          afterCheckpoint: async (sidecar) => {
            if (
              !injected &&
              sidecar.progress.phase === 'jobs' &&
              sidecar.progress.jobCursor !== null
            ) {
              injected = true;
              throw new Error('测试注入中断');
            }
          },
        },
      ),
    ).rejects.toThrow('测试注入中断');

    const interruptedMap = JSON.parse(
      await readFile(idMapPath, 'utf8'),
    ) as LegacyIdMap;
    expect(interruptedMap.status).toBe('running');
    expect(interruptedMap.progress.jobCursor).toBe(10);

    const resumed = await migrateSqliteToPostgres(
      {
        source,
        target: TARGET_URL,
        initialAdminEmail: ADMIN_EMAIL,
        dryRun: false,
        idMapPath,
        batchSize: 1,
      },
      { target, hashPassword: async () => '$argon2id$must-not-run' },
    );
    expect(resumed.status).toBe('completed');
    expect(target.jobs).toHaveLength(2);
    expect(target.knowledgeItems).toHaveLength(2);

    const writesAfterCompletion = target.writeCalls;
    const rerun = await migrateSqliteToPostgres(
      {
        source,
        target: TARGET_URL,
        initialAdminEmail: ADMIN_EMAIL,
        dryRun: false,
        idMapPath,
        batchSize: 1,
      },
      { target, hashPassword: async () => '$argon2id$must-not-run' },
    );
    expect(rerun.status).toBe('already-completed');
    expect(target.writeCalls).toBe(writesAfterCompletion);
  });

  it('数据库批次已提交但 sidecar 尚未写入时，从 PostgreSQL journal 恢复且不重复写入', async () => {
    const source = await createLegacyFixture(directory);
    const target = new MemoryTarget();
    const idMapPath = join(directory, 'id-map.json');
    let injected = false;

    await expect(
      migrateSqliteToPostgres(
        {
          source,
          target: TARGET_URL,
          initialAdminEmail: ADMIN_EMAIL,
          dryRun: false,
          idMapPath,
          batchSize: 1,
        },
        {
          target,
          hashPassword: async () => '$argon2id$test-hash',
          afterDatabaseCommit: async (sidecar) => {
            if (
              !injected &&
              sidecar.progress.phase === 'jobs' &&
              sidecar.progress.jobCursor === 10
            ) {
              injected = true;
              throw new Error('模拟 DB commit 后、sidecar rename 前崩溃');
            }
          },
        },
      ),
    ).rejects.toThrow('模拟 DB commit 后、sidecar rename 前崩溃');

    const staleMap = JSON.parse(
      await readFile(idMapPath, 'utf8'),
    ) as LegacyIdMap;
    expect(staleMap.progress.jobCursor).toBeNull();
    expect(target.jobs).toHaveLength(1);

    const resumed = await migrateSqliteToPostgres(
      {
        source,
        target: TARGET_URL,
        initialAdminEmail: ADMIN_EMAIL,
        dryRun: false,
        idMapPath,
        batchSize: 1,
      },
      { target, hashPassword: async () => '$argon2id$must-not-run' },
    );

    expect(resumed.status).toBe('completed');
    expect(target.jobs.map((job) => job.legacyId)).toEqual([10, 11]);
    expect(target.knowledgeItems.map((item) => item.jobId)).toEqual([300, 301]);
  });

  it.each([
    [
      '交换 journal 中的 Job 映射',
      (target: MemoryTarget) => {
        const jobEntries = target.journals.filter(
          (entry) => entry.phase === 'jobs',
        );
        const first = jobEntries[0].mappings.jobs!;
        const second = jobEntries[1].mappings.jobs!;
        [first['10'], second['11']] = [second['11'], first['10']];
      },
    ],
    [
      '篡改 Job owner',
      (target: MemoryTarget) => {
        target.jobs[0].userId = 999;
      },
    ],
    [
      '篡改 KnowledgeItem.jobId',
      (target: MemoryTarget) => {
        target.knowledgeItems[0].jobId = 301;
      },
    ],
    [
      '篡改 SourceVersion.contentHash',
      (target: MemoryTarget) => {
        target.sourceVersions[0].contentHash = 'tampered';
      },
    ],
    [
      '篡改 journal cursor',
      (target: MemoryTarget) => {
        const jobEntry = target.journals.find(
          (entry) => entry.phase === 'jobs',
        )!;
        jobEntry.cursor = 999;
      },
    ],
  ])('恢复时逐项验证并拒绝：%s', async (_name, tamper) => {
    const source = await createLegacyFixture(directory);
    const target = new MemoryTarget();
    const options = {
      source,
      target: TARGET_URL,
      initialAdminEmail: ADMIN_EMAIL,
      dryRun: false,
      idMapPath: join(directory, 'id-map.json'),
      batchSize: 1,
    };
    await migrateSqliteToPostgres(options, {
      target,
      hashPassword: async () => '$argon2id$test-hash',
    });
    tamper(target);

    await expect(
      migrateSqliteToPostgres(options, {
        target,
        hashPassword: async () => '$argon2id$must-not-run',
      }),
    ).rejects.toThrow(/不一致|无效|覆盖|游标|拒绝/);
  });

  it('拒绝 journal 伪造的 completed 状态', async () => {
    const source = await createLegacyFixture(directory);
    const target = new MemoryTarget();
    const options = {
      source,
      target: TARGET_URL,
      initialAdminEmail: ADMIN_EMAIL,
      dryRun: false,
      idMapPath: join(directory, 'id-map.json'),
      batchSize: 1,
    };

    await expect(
      migrateSqliteToPostgres(options, {
        target,
        hashPassword: async () => '$argon2id$test-hash',
        afterDatabaseCommit: async (sidecar) => {
          if (sidecar.progress.jobCursor === 10) {
            throw new Error('中断在首个 Job 批次');
          }
        },
      }),
    ).rejects.toThrow('中断在首个 Job 批次');
    const identity = target.journals[0];
    await target.markCompleted(identity.adminId, {
      importKey: identity.importKey,
      sourceFileSha256: identity.sourceFileSha256,
      targetFingerprint: identity.targetFingerprint,
      initialAdminEmailNormalized: identity.initialAdminEmailNormalized,
    });

    await expect(
      migrateSqliteToPostgres(options, {
        target,
        hashPassword: async () => '$argon2id$must-not-run',
      }),
    ).rejects.toThrow(/completed|覆盖|不完整/);
  });

  it('全表保护：仅 PromptVersion 或 QuotaPolicy 非空时 dry-run/真实导入均在写前拒绝', async () => {
    const source = await createLegacyFixture(directory);
    const dryRunTarget = new MemoryTarget();
    dryRunTarget.extraTableCounts.PromptVersion = 1;
    await expect(
      migrateSqliteToPostgres(
        {
          source,
          target: TARGET_URL,
          initialAdminEmail: ADMIN_EMAIL,
          dryRun: true,
          idMapPath: join(directory, 'dry-map.json'),
          batchSize: 100,
        },
        { target: dryRunTarget },
      ),
    ).rejects.toThrow(/PromptVersion|应用数据|非空/);
    expect(dryRunTarget.writeCalls).toBe(0);

    const realTarget = new MemoryTarget();
    realTarget.extraTableCounts.QuotaPolicy = 1;
    await expect(
      migrateSqliteToPostgres(
        {
          source,
          target: TARGET_URL,
          initialAdminEmail: ADMIN_EMAIL,
          dryRun: false,
          idMapPath: join(directory, 'real-map.json'),
          batchSize: 100,
        },
        {
          target: realTarget,
          hashPassword: async () => '$argon2id$must-not-run',
        },
      ),
    ).rejects.toThrow(/QuotaPolicy|应用数据|非空/);
    expect(realTarget.writeCalls).toBe(0);
  });

  it('按已知 target 主动清洗嵌套错误中的原始及 percent-encoded 凭据', () => {
    const encodedTarget =
      'postgresql://user%40tenant:p%40ss%2Fword@db.example.test:5432/app?schema=import';
    const outer = new Error(
      `Prisma 连接失败，密码片段 p%40ss%2Fword，目标 ${encodedTarget}`,
      {
        cause: new Error('认证失败：user@tenant / p@ss/word'),
      },
    );

    const sanitized = sanitizeTargetError(outer, encodedTarget);

    for (const secret of [
      encodedTarget,
      'user%40tenant',
      'user@tenant',
      'p%40ss%2Fword',
      'p@ss/word',
    ]) {
      expect(sanitized).not.toContain(secret);
    }
    expect(sanitized).toContain('[已清洗]');
  });

  it('目标指纹排除凭据并规范化 PostgreSQL 协议别名', () => {
    const first =
      'postgresql://first-user:first-password@db.example.test:5432/app?schema=import';
    const rotated =
      'postgres://rotated-user:rotated-password@db.example.test:5432/app?schema=import';

    expect(computeTargetFingerprint(first)).toBe(
      computeTargetFingerprint(rotated),
    );
  });

  it('两个 PostgreSQL 协议别名向目标层传递完全相同的锁身份', async () => {
    const source = await createLegacyFixture(directory);
    const firstTarget = new MemoryTarget();
    const aliasTarget = new MemoryTarget();
    const commonOptions = {
      source,
      initialAdminEmail: ADMIN_EMAIL,
      dryRun: true,
      batchSize: 100,
    };

    await migrateSqliteToPostgres(
      {
        ...commonOptions,
        target:
          'postgresql://first-user:first-password@db.example.test:5432/app?schema=import',
        idMapPath: join(directory, 'protocol-first-map.json'),
      },
      { target: firstTarget },
    );
    await migrateSqliteToPostgres(
      {
        ...commonOptions,
        target:
          'postgres://rotated-user:rotated-password@db.example.test:5432/app?schema=import',
        idMapPath: join(directory, 'protocol-alias-map.json'),
      },
      { target: aliasTarget },
    );

    expect(firstTarget.lockFingerprints).toEqual(aliasTarget.lockFingerprints);
  });

  it.each([
    [
      '未知 phase',
      (record: Record<string, unknown>) => {
        (record.afterMetadata as Record<string, unknown>).phase = 'forged';
      },
    ],
    [
      'metadata 缺少字段',
      (record: Record<string, unknown>) => {
        delete (record.afterMetadata as Record<string, unknown>)
          .sourceFileSha256;
      },
    ],
    [
      '错误 result',
      (record: Record<string, unknown>) => {
        record.result = 'FAILED';
      },
    ],
    [
      '错误 targetId',
      (record: Record<string, unknown>) => {
        record.targetId = 'another-import-key';
      },
    ],
    [
      'actorUserId 为 null',
      (record: Record<string, unknown>) => {
        record.actorUserId = null;
      },
    ],
    [
      'targetUserId 属于他人',
      (record: Record<string, unknown>) => {
        record.targetUserId = 999;
      },
    ],
    [
      'bootstrap 携带 Job 映射',
      (record: Record<string, unknown>) => {
        (
          (record.afterMetadata as Record<string, unknown>).mappings as Record<
            string,
            unknown
          >
        ).jobs = { '10': 300 };
      },
    ],
    [
      'jobs 携带 Tool 映射',
      (record: Record<string, unknown>) => {
        const metadata = record.afterMetadata as Record<string, unknown>;
        metadata.phase = 'jobs';
        metadata.mappings = {
          jobs: { '10': 300 },
          tools: { '7': 200 },
        };
      },
    ],
    [
      'knowledge-items 携带 Job 映射',
      (record: Record<string, unknown>) => {
        const metadata = record.afterMetadata as Record<string, unknown>;
        metadata.phase = 'knowledge-items';
        metadata.mappings = {
          knowledgeItems: { '20': 400 },
          learningSources: { '20': 500 },
          sourceVersions: { '20': 600 },
          jobs: { '10': 300 },
        };
      },
    ],
    [
      'completed 携带新增映射',
      (record: Record<string, unknown>) => {
        const metadata = record.afterMetadata as Record<string, unknown>;
        metadata.phase = 'completed';
        metadata.cursor = null;
        metadata.mappings = { sourceVersions: { '20': 600 } };
      },
    ],
  ])('拒绝同 import key 的伪 AuditEvent：%s', (_name, tamper) => {
    const identity: MigrationJournalIdentity = {
      importKey: 'same-import-key',
      sourceFileSha256: 'a'.repeat(64),
      targetFingerprint: 'b'.repeat(64),
      initialAdminEmailNormalized: 'admin@example.test',
    };
    const rawRecord: Record<string, unknown> = {
      id: 1,
      result: 'SUCCESS',
      targetId: identity.importKey,
      actorUserId: 100,
      targetUserId: 100,
      createdAt: new Date('2026-07-30T00:00:00.000Z'),
      afterMetadata: {
        formatVersion: 1,
        ...identity,
        adminId: 100,
        phase: 'bootstrap',
        cursor: 7,
        mappings: { tools: { '7': 200 } },
      },
    };
    tamper(rawRecord);

    expect(() => parseMigrationJournalRecord(rawRecord, identity)).toThrow(
      /journal|AuditEvent|phase|mapping|身份|字段|SUCCESS/,
    );
  });

  it('在任何目标读取前获取迁移锁，并在 dry-run 结束后释放', async () => {
    const source = await createLegacyFixture(directory);
    const target = new MemoryTarget();

    await migrateSqliteToPostgres(
      {
        source,
        target: TARGET_URL,
        initialAdminEmail: ADMIN_EMAIL,
        dryRun: true,
        idMapPath: join(directory, 'id-map.json'),
        batchSize: 100,
      },
      { target },
    );

    expect(target.lifecycleEvents).toEqual(['获取锁', '读取目标', '释放锁']);
  });

  it('源 SQLite 在最后批次后发生变化时拒绝写 completed journal', async () => {
    const source = await createLegacyFixture(directory);
    const target = new MemoryTarget();
    let changed = false;

    await expect(
      migrateSqliteToPostgres(
        {
          source,
          target: TARGET_URL,
          initialAdminEmail: ADMIN_EMAIL,
          dryRun: false,
          idMapPath: join(directory, 'id-map.json'),
          batchSize: 1,
        },
        {
          target,
          hashPassword: async () => '$argon2id$test-hash',
          afterDatabaseCommit: async (sidecar) => {
            if (
              !changed &&
              sidecar.progress.phase === 'knowledge-items' &&
              sidecar.progress.knowledgeItemCursor === 21
            ) {
              changed = true;
              await appendFile(source, Buffer.from('source-changed'));
            }
          },
        },
      ),
    ).rejects.toThrow(/源|SQLite|SHA-256|变化/);
    expect(target.journals.some((entry) => entry.phase === 'completed')).toBe(
      false,
    );
  });

  it('正式 package script 只运行 build 产物，并保留独立开发入口', async () => {
    const packageJson = JSON.parse(
      await readFile(join(__dirname, '..', 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts['db:migrate:sqlite']).toBe(
      'node dist/scripts/migrate-sqlite-to-postgres.js',
    );
    expect(packageJson.scripts['db:migrate:sqlite:dev']).toContain('ts-node');
  });

  it('非法 percent 编码的 userinfo 不会让错误清洗器抛 URIError', () => {
    const malformedTarget =
      'postgresql://user:%ZZ@db.example.test:5432/app?schema=import';

    expect(() =>
      sanitizeTargetError(
        new Error('连接失败，仅回显非法密码 %ZZ'),
        malformedTarget,
      ),
    ).not.toThrow();
    expect(
      sanitizeTargetError(
        new Error('连接失败，仅回显非法密码 %ZZ'),
        malformedTarget,
      ),
    ).not.toContain('%ZZ');
  });

  it('释放锁失败时清洗凭据，且不覆盖已有主错误', async () => {
    const source = await createLegacyFixture(directory);
    const cleanupOnlyTarget = new MemoryTarget();
    cleanupOnlyTarget.releaseFailure = new Error('release failed: secret-pass');
    let cleanupError: unknown;
    try {
      await migrateSqliteToPostgres(
        {
          source,
          target: TARGET_URL,
          initialAdminEmail: ADMIN_EMAIL,
          dryRun: true,
          idMapPath: join(directory, 'cleanup-map.json'),
          batchSize: 100,
        },
        { target: cleanupOnlyTarget },
      );
    } catch (error) {
      cleanupError = error;
    }
    expect(cleanupError).toBeInstanceOf(Error);
    expect((cleanupError as Error).message).not.toContain('secret-pass');
    expect((cleanupError as Error).message).toContain('[已清洗]');

    const primaryTarget = new MemoryTarget();
    primaryTarget.extraTableCounts.PromptVersion = 1;
    primaryTarget.releaseFailure = new Error('release failed: secret-pass');
    let primaryError: unknown;
    try {
      await migrateSqliteToPostgres(
        {
          source,
          target: TARGET_URL,
          initialAdminEmail: ADMIN_EMAIL,
          dryRun: true,
          idMapPath: join(directory, 'primary-map.json'),
          batchSize: 100,
        },
        { target: primaryTarget },
      );
    } catch (error) {
      primaryError = error;
    }
    expect(primaryError).toBeInstanceOf(Error);
    expect((primaryError as Error).message).toContain('PromptVersion');
    expect((primaryError as Error).message).not.toContain('secret-pass');
  });
});
