import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Prisma, PrismaClient } from '@prisma/client';
import { argon2id, hash as hashArgon2 } from 'argon2';

type PgQueryResult<Row> = {
  rows: Row[];
};

type PgLockClient = {
  connect(): Promise<void>;
  query<Row>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PgQueryResult<Row>>;
  end(): Promise<void>;
};

type PgModule = {
  Client: new (options: { connectionString: string }) => PgLockClient;
};

export type LegacyTool = {
  id: number;
  key: string;
  name: string;
  icon: string;
  route: string;
  enabled: boolean;
  createdAt: Date;
};

export type LegacyJob = {
  id: number;
  toolKey: string;
  status: string;
  input: string | null;
  output: string | null;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LegacyKnowledgeItem = {
  id: number;
  title: string;
  url: string;
  source: string | null;
  contentHtml: string | null;
  contentMarkdown: string | null;
  status: string;
  capturedAt: Date;
  jobId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type ApplicationCounts = {
  users: number;
  tools: number;
  jobs: number;
  knowledgeItems: number;
  learningSources: number;
  sourceVersions: number;
  apiTokens: number;
};

export type LegacyIdMap = {
  formatVersion: 1;
  status: 'running' | 'completed';
  sourceFileSha256: string;
  targetFingerprint: string;
  initialAdmin: {
    id: number;
    emailNormalized: string;
  };
  ids: {
    tools: Record<string, number>;
    jobs: Record<string, number>;
    knowledgeItems: Record<string, number>;
    learningSources: Record<string, number>;
    sourceVersions: Record<string, number>;
  };
  progress: {
    phase: 'bootstrap' | 'jobs' | 'knowledge-items' | 'completed';
    toolCursor: number | null;
    jobCursor: number | null;
    knowledgeItemCursor: number | null;
  };
  updatedAt: string;
};

export type MigrationJournalEntry = {
  formatVersion: 1;
  importKey: string;
  sourceFileSha256: string;
  targetFingerprint: string;
  initialAdminEmailNormalized: string;
  adminId: number;
  phase: 'bootstrap' | 'jobs' | 'knowledge-items' | 'completed';
  cursor: number | null;
  mappings: {
    tools?: Record<string, number>;
    jobs?: Record<string, number>;
    knowledgeItems?: Record<string, number>;
    learningSources?: Record<string, number>;
    sourceVersions?: Record<string, number>;
  };
};

export type MigrationJournalIdentity = {
  importKey: string;
  sourceFileSha256: string;
  targetFingerprint: string;
  initialAdminEmailNormalized: string;
};

export type MigrationJournalRecord = {
  id: number;
  result: unknown;
  targetId: unknown;
  actorUserId: unknown;
  targetUserId: unknown;
  createdAt: unknown;
  afterMetadata: unknown;
};

export interface MigrationTarget {
  acquireMigrationLock(targetFingerprint: string): Promise<void>;
  releaseMigrationLock(): Promise<void>;
  getTableCounts(): Promise<Record<string, number>>;
  loadMigrationJournal(importKey: string): Promise<MigrationJournalRecord[]>;
  createBootstrap(input: {
    email: string;
    emailNormalized: string;
    passwordHash: string;
    tools: LegacyTool[];
    journal: MigrationJournalIdentity;
  }): Promise<{ adminId: number; tools: Record<string, number> }>;
  createJobs(
    adminId: number,
    jobs: LegacyJob[],
    journal: MigrationJournalIdentity,
  ): Promise<Array<{ legacyId: number; targetId: number }>>;
  createKnowledgeItems(input: {
    adminId: number;
    journal: MigrationJournalIdentity;
    items: Array<
      LegacyKnowledgeItem & {
        targetJobId: number | null;
        canonicalUrl: string | null;
        contentHash: string;
      }
    >;
  }): Promise<
    Array<{
      legacyId: number;
      knowledgeItemId: number;
      learningSourceId: number;
      sourceVersionId: number;
    }>
  >;
  markCompleted(
    adminId: number,
    journal: MigrationJournalIdentity,
  ): Promise<void>;
  assertResumeState(
    sidecar: LegacyIdMap,
    snapshot: LegacySnapshot,
    journalEntryCount: number,
  ): Promise<void>;
  disconnect(): Promise<void>;
}

export type MigrationOptions = {
  source: string;
  target: string;
  initialAdminEmail: string;
  dryRun: boolean;
  idMapPath: string;
  batchSize: number;
};

type MigrationDependencies = {
  target?: MigrationTarget;
  hashPassword?: (randomPassword: string) => Promise<string>;
  afterDatabaseCommit?: (sidecar: LegacyIdMap) => Promise<void>;
  afterCheckpoint?: (sidecar: LegacyIdMap) => Promise<void>;
};

export type LegacySnapshot = {
  sourceFileSha256: string;
  tools: LegacyTool[];
  jobs: LegacyJob[];
  knowledgeItems: LegacyKnowledgeItem[];
  apiTokenCount: number;
};

export type MigrationReport = {
  status: 'dry-run' | 'completed' | 'already-completed';
  sourceFileSha256: string;
  targetFingerprint: string;
  initialAdminEmailNormalized: string;
  counts: {
    tools: number;
    jobs: number;
    apiTokensSkipped: number;
    knowledgeItems: number;
    learningSources: number;
    sourceVersions: number;
  };
};

type SqliteRow = Record<string, unknown>;

const REQUIRED_LEGACY_TABLES = ['Tool', 'Job', 'ApiToken', 'KnowledgeItem'];
const JOURNAL_ACTION = 'SQLITE_IMPORT_JOURNAL';
const JOURNAL_TARGET_TYPE = 'SqliteToPostgresMigration';
const EMPTY_COUNTS: ApplicationCounts = {
  users: 0,
  tools: 0,
  jobs: 0,
  knowledgeItems: 0,
  learningSources: 0,
  sourceVersions: 0,
  apiTokens: 0,
};

function digest(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function computeContentHash(
  contentMarkdown: string | null,
  contentHtml: string | null,
): string {
  return digest(Buffer.from(contentMarkdown ?? contentHtml ?? '', 'utf8'));
}

function requiredString(row: SqliteRow, field: string, table: string): string {
  const value = row[field];
  if (typeof value !== 'string') {
    throw new Error(`旧 SQLite 的 ${table}.${field} 不是有效文本`);
  }
  return value;
}

function nullableString(row: SqliteRow, field: string): string | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new Error(`旧 SQLite 字段 ${field} 不是有效文本`);
  }
  return value;
}

function integer(row: SqliteRow, field: string, table: string): number {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`旧 SQLite 的 ${table}.${field} 不是安全整数`);
  }
  return value;
}

function nullableInteger(
  row: SqliteRow,
  field: string,
  table: string,
): number | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  return integer(row, field, table);
}

function dateValue(row: SqliteRow, field: string, table: string): Date {
  const value = requiredString(row, field, table);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`旧 SQLite 的 ${table}.${field} 不是有效时间`);
  }
  return parsed;
}

function nullableDate(
  row: SqliteRow,
  field: string,
  table: string,
): Date | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new Error(`旧 SQLite 的 ${table}.${field} 不是有效时间文本`);
  }
  return dateValue({ [field]: value }, field, table);
}

function tableNames(database: DatabaseSync): Set<string> {
  const rows = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as SqliteRow[];
  return new Set(rows.map((row) => String(row.name)));
}

async function loadLegacySnapshot(source: string): Promise<LegacySnapshot> {
  const sourcePath = resolve(source);
  const sourceStat = await stat(sourcePath);
  if (!sourceStat.isFile()) {
    throw new Error('--source 必须指向 SQLite 文件');
  }
  const bytesBefore = await readFile(sourcePath);
  const sourceFileSha256 = digest(bytesBefore);
  const database = new DatabaseSync(sourcePath, { readOnly: true });
  let snapshot: LegacySnapshot;

  try {
    const names = tableNames(database);
    for (const table of REQUIRED_LEGACY_TABLES) {
      if (!names.has(table)) {
        throw new Error(`旧 SQLite 缺少必需表 ${table}`);
      }
    }

    const toolRows = database
      .prepare('SELECT * FROM "Tool" ORDER BY "id"')
      .all() as SqliteRow[];
    const jobRows = database
      .prepare('SELECT * FROM "Job" ORDER BY "id"')
      .all() as SqliteRow[];
    const knowledgeRows = database
      .prepare('SELECT * FROM "KnowledgeItem" ORDER BY "id"')
      .all() as SqliteRow[];
    const tokenCountRow = database
      .prepare('SELECT COUNT(*) AS count FROM "ApiToken"')
      .get() as SqliteRow;

    const tools = toolRows.map((row): LegacyTool => {
      const enabled = row.enabled;
      return {
        id: integer(row, 'id', 'Tool'),
        key: requiredString(row, 'key', 'Tool'),
        name: requiredString(row, 'name', 'Tool'),
        icon: requiredString(row, 'icon', 'Tool'),
        route: requiredString(row, 'route', 'Tool'),
        enabled: enabled === true || enabled === 1,
        createdAt: dateValue(row, 'createdAt', 'Tool'),
      };
    });
    const jobs = jobRows.map(
      (row): LegacyJob => ({
        id: integer(row, 'id', 'Job'),
        toolKey: requiredString(row, 'toolKey', 'Job'),
        status: requiredString(row, 'status', 'Job'),
        input: nullableString(row, 'input'),
        output: nullableString(row, 'output'),
        error: nullableString(row, 'error'),
        startedAt: nullableDate(row, 'startedAt', 'Job'),
        completedAt: nullableDate(row, 'completedAt', 'Job'),
        createdAt: dateValue(row, 'createdAt', 'Job'),
        updatedAt: dateValue(row, 'updatedAt', 'Job'),
      }),
    );
    const knowledgeItems = knowledgeRows.map(
      (row): LegacyKnowledgeItem => ({
        id: integer(row, 'id', 'KnowledgeItem'),
        title: requiredString(row, 'title', 'KnowledgeItem'),
        url: requiredString(row, 'url', 'KnowledgeItem'),
        source: nullableString(row, 'source'),
        contentHtml: nullableString(row, 'contentHtml'),
        contentMarkdown: nullableString(row, 'contentMarkdown'),
        status: requiredString(row, 'status', 'KnowledgeItem'),
        capturedAt: dateValue(row, 'capturedAt', 'KnowledgeItem'),
        jobId: nullableInteger(row, 'jobId', 'KnowledgeItem'),
        createdAt: dateValue(row, 'createdAt', 'KnowledgeItem'),
        updatedAt: dateValue(row, 'updatedAt', 'KnowledgeItem'),
      }),
    );

    snapshot = {
      sourceFileSha256,
      tools,
      jobs,
      knowledgeItems,
      apiTokenCount: integer(tokenCountRow, 'count', 'ApiToken'),
    };
  } finally {
    database.close();
  }
  const hashAfter = digest(await readFile(sourcePath));
  if (hashAfter !== sourceFileSha256) {
    throw new Error('旧 SQLite 在只读检查期间发生变化，已停止迁移');
  }
  return snapshot;
}

function assertLegacyIntegrity(snapshot: LegacySnapshot): void {
  const jobIds = new Set(snapshot.jobs.map((job) => job.id));
  const linkedJobIds = new Set<number>();
  for (const item of snapshot.knowledgeItems) {
    if (item.jobId === null) continue;
    if (!jobIds.has(item.jobId)) {
      throw new Error(
        `KnowledgeItem legacy ID ${item.id} 引用了不存在的 Job legacy ID ${item.jobId}`,
      );
    }
    if (linkedJobIds.has(item.jobId)) {
      throw new Error(
        `多个 KnowledgeItem 引用了 Job legacy ID ${item.jobId}，违反目标一对一约束`,
      );
    }
    linkedJobIds.add(item.jobId);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): void {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('--initial-admin-email 必须是有效邮箱地址');
  }
}

function parseTargetUrl(target: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error('--target 必须是有效 PostgreSQL URL');
  }
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error('--target 必须使用 postgresql:// 或 postgres://');
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('--target 必须包含主机和数据库名');
  }
  return parsed;
}

export function computeTargetFingerprint(target: string): string {
  const parsed = parseTargetUrl(target);
  return digest(
    JSON.stringify({
      protocol: 'postgresql',
      hostname: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.slice(1),
      schema: parsed.searchParams.get('schema') ?? 'public',
    }),
  );
}

function migrationImportKey(
  sourceFileSha256: string,
  fingerprint: string,
  emailNormalized: string,
): string {
  return digest(
    JSON.stringify({ sourceFileSha256, fingerprint, emailNormalized }),
  );
}

export function sanitizeCliError(message: string): string {
  const urls = message.match(/postgres(?:ql)?:\/\/[^\s"'<>，。；]+/giu) ?? [];
  const sensitive: string[] = [];
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      sensitive.push(
        parsed.username,
        parsed.password,
        decodeURIComponent(parsed.username),
        decodeURIComponent(parsed.password),
      );
    } catch {
      // 即使 URL 本身无效，下面仍会整体替换，不回显凭据片段。
    }
  }
  let sanitized = message;
  for (const url of urls) {
    sanitized = sanitized.split(url).join('[已清洗 PostgreSQL URL]');
  }
  for (const value of sensitive) {
    if (!value) continue;
    sanitized = sanitized.split(value).join('[已清洗]');
  }
  return sanitized;
}

function sanitizeMessage(message: string, target: string): string {
  return sanitizeTargetError(message, target);
}

function flattenError(error: unknown, seen = new Set<unknown>()): string {
  if (error === null) return 'null';
  if (error === undefined) return 'undefined';
  if (typeof error === 'string') return error;
  if (
    typeof error === 'number' ||
    typeof error === 'bigint' ||
    typeof error === 'boolean'
  ) {
    return `${error}`;
  }
  if (typeof error === 'symbol') return error.description ?? '[symbol]';
  if (typeof error === 'function') return error.name || '[function]';
  if (seen.has(error)) return '[循环错误原因]';
  seen.add(error);
  if (error instanceof Error) {
    const cause = flattenError(error.cause, seen);
    return error.cause === undefined
      ? error.message
      : `${error.message}；cause：${cause}`;
  }
  const record = error as Record<string, unknown>;
  return Object.entries(record)
    .map(([key, value]) => `${key}：${flattenError(value, seen)}`)
    .join('；');
}

export function sanitizeTargetError(error: unknown, target: string): string {
  const raw = flattenError(error);
  let sanitized = sanitizeCliError(raw);
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return sanitized.split(target).join('[已清洗 PostgreSQL URL]');
  }
  const secrets = [
    target,
    parsed.username,
    parsed.password,
    safeDecode(parsed.username),
    safeDecode(parsed.password),
  ].filter(Boolean);
  sanitized = sanitized.split(target).join('[已清洗 PostgreSQL URL]');
  for (const secret of secrets) {
    sanitized = sanitized.split(secret).join('[已清洗]');
  }
  return sanitized;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function nonEmptyApplicationTables(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([table, count]) => table !== '_prisma_migrations' && count > 0)
    .map(([table]) => table)
    .sort();
}

function reportFor(
  status: MigrationReport['status'],
  snapshot: LegacySnapshot,
  fingerprint: string,
  emailNormalized: string,
): MigrationReport {
  return {
    status,
    sourceFileSha256: snapshot.sourceFileSha256,
    targetFingerprint: fingerprint,
    initialAdminEmailNormalized: emailNormalized,
    counts: {
      tools: snapshot.tools.length,
      jobs: snapshot.jobs.length,
      apiTokensSkipped: snapshot.apiTokenCount,
      knowledgeItems: snapshot.knowledgeItems.length,
      learningSources: snapshot.knowledgeItems.length,
      sourceVersions: snapshot.knowledgeItems.length,
    },
  };
}

async function readSidecar(path: string): Promise<LegacyIdMap | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as LegacyIdMap;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`无法读取 LegacyIdMap：${(error as Error).message}`);
  }
}

async function writeSidecarAtomically(
  path: string,
  sidecar: LegacyIdMap,
): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(sidecar, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function assertSidecarMatches(
  sidecar: LegacyIdMap,
  sourceFileSha256: string,
  fingerprint: string,
  emailNormalized: string,
): void {
  if (sidecar.formatVersion !== 1) {
    throw new Error('LegacyIdMap 格式版本不受支持');
  }
  if (sidecar.sourceFileSha256 !== sourceFileSha256) {
    throw new Error('LegacyIdMap 的源文件哈希不匹配');
  }
  if (sidecar.targetFingerprint !== fingerprint) {
    throw new Error('LegacyIdMap 的目标指纹不匹配');
  }
  if (sidecar.initialAdmin.emailNormalized !== emailNormalized) {
    throw new Error('LegacyIdMap 的初始管理员不匹配');
  }
  if (!['running', 'completed'].includes(sidecar.status)) {
    throw new Error('LegacyIdMap 状态无效');
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseIdMapping(value: unknown, label: string): Record<string, number> {
  if (!isPlainRecord(value)) {
    throw new Error(`迁移 journal mapping ${label} 不是对象`);
  }
  const mapping: Record<string, number> = {};
  for (const [legacyId, targetId] of Object.entries(value)) {
    const parsedLegacyId = Number(legacyId);
    if (
      !Number.isSafeInteger(parsedLegacyId) ||
      String(parsedLegacyId) !== legacyId ||
      typeof targetId !== 'number' ||
      !Number.isSafeInteger(targetId)
    ) {
      throw new Error(`迁移 journal mapping ${label} 含无效 ID`);
    }
    mapping[legacyId] = targetId;
  }
  return mapping;
}

export function parseMigrationJournalRecord(
  raw: unknown,
  identity: MigrationJournalIdentity,
): MigrationJournalEntry {
  if (!isPlainRecord(raw)) {
    throw new Error('迁移 journal AuditEvent 不是对象');
  }
  if (
    typeof raw.id !== 'number' ||
    !Number.isSafeInteger(raw.id) ||
    raw.result !== 'SUCCESS' ||
    raw.targetId !== identity.importKey ||
    !(raw.createdAt instanceof Date) ||
    Number.isNaN(raw.createdAt.getTime())
  ) {
    throw new Error('迁移 journal AuditEvent 外层字段无效或不是 SUCCESS');
  }
  if (!isPlainRecord(raw.afterMetadata)) {
    throw new Error('迁移 journal afterMetadata 不是对象');
  }
  const metadata = raw.afterMetadata;
  const expectedMetadataKeys = [
    'adminId',
    'cursor',
    'formatVersion',
    'importKey',
    'initialAdminEmailNormalized',
    'mappings',
    'phase',
    'sourceFileSha256',
    'targetFingerprint',
  ];
  if (
    JSON.stringify(Object.keys(metadata).sort()) !==
    JSON.stringify(expectedMetadataKeys)
  ) {
    throw new Error('迁移 journal metadata 字段集合无效');
  }
  const allowedPhases = [
    'bootstrap',
    'jobs',
    'knowledge-items',
    'completed',
  ] as const;
  if (
    metadata.formatVersion !== 1 ||
    metadata.importKey !== identity.importKey ||
    metadata.sourceFileSha256 !== identity.sourceFileSha256 ||
    metadata.targetFingerprint !== identity.targetFingerprint ||
    metadata.initialAdminEmailNormalized !==
      identity.initialAdminEmailNormalized ||
    typeof metadata.adminId !== 'number' ||
    !Number.isSafeInteger(metadata.adminId) ||
    !allowedPhases.includes(metadata.phase as (typeof allowedPhases)[number]) ||
    !(
      metadata.cursor === null ||
      (typeof metadata.cursor === 'number' &&
        Number.isSafeInteger(metadata.cursor))
    ) ||
    !isPlainRecord(metadata.mappings)
  ) {
    throw new Error('迁移 journal metadata 身份、版本、phase 或字段无效');
  }
  if (
    raw.actorUserId !== metadata.adminId ||
    raw.targetUserId !== metadata.adminId
  ) {
    throw new Error('迁移 journal AuditEvent actor/target 身份无效');
  }

  const phase = metadata.phase as MigrationJournalEntry['phase'];
  const mappingKeys = Object.keys(metadata.mappings).sort();
  const allowedMappingKeys: Record<MigrationJournalEntry['phase'], string[]> = {
    bootstrap: ['tools'],
    jobs: ['jobs'],
    'knowledge-items': ['knowledgeItems', 'learningSources', 'sourceVersions'],
    completed: [],
  };
  if (
    JSON.stringify(mappingKeys) !==
    JSON.stringify(allowedMappingKeys[phase].slice().sort())
  ) {
    throw new Error(`迁移 journal phase ${phase} 携带非法 mapping`);
  }
  const mappings: MigrationJournalEntry['mappings'] = {};
  for (const key of allowedMappingKeys[phase]) {
    mappings[key as keyof MigrationJournalEntry['mappings']] = parseIdMapping(
      metadata.mappings[key],
      key,
    );
  }
  return {
    formatVersion: 1,
    importKey: identity.importKey,
    sourceFileSha256: identity.sourceFileSha256,
    targetFingerprint: identity.targetFingerprint,
    initialAdminEmailNormalized: identity.initialAdminEmailNormalized,
    adminId: metadata.adminId,
    phase,
    cursor: metadata.cursor,
    mappings,
  };
}

function rebuildSidecarFromJournal(
  records: MigrationJournalRecord[],
  identity: MigrationJournalIdentity,
  snapshot: LegacySnapshot,
): LegacyIdMap {
  const entries = records.map((record) =>
    parseMigrationJournalRecord(record, identity),
  );
  if (entries.length === 0) {
    throw new Error('PostgreSQL 迁移 journal 为空');
  }
  const bootstrap = entries[0];
  if (bootstrap.phase !== 'bootstrap') {
    throw new Error('PostgreSQL 迁移 journal 缺少 bootstrap');
  }
  const sidecar: LegacyIdMap = {
    formatVersion: 1,
    status: 'running',
    sourceFileSha256: identity.sourceFileSha256,
    targetFingerprint: identity.targetFingerprint,
    initialAdmin: {
      id: bootstrap.adminId,
      emailNormalized: identity.initialAdminEmailNormalized,
    },
    ids: {
      tools: {},
      jobs: {},
      knowledgeItems: {},
      learningSources: {},
      sourceVersions: {},
    },
    progress: {
      phase: 'bootstrap',
      toolCursor: null,
      jobCursor: null,
      knowledgeItemCursor: null,
    },
    updatedAt: new Date().toISOString(),
  };
  let jobOffset = 0;
  let knowledgeOffset = 0;
  let completed = false;
  for (const entry of entries) {
    if (
      entry.formatVersion !== 1 ||
      entry.importKey !== identity.importKey ||
      entry.sourceFileSha256 !== identity.sourceFileSha256 ||
      entry.targetFingerprint !== identity.targetFingerprint ||
      entry.initialAdminEmailNormalized !==
        identity.initialAdminEmailNormalized ||
      entry.adminId !== bootstrap.adminId
    ) {
      throw new Error('PostgreSQL 迁移 journal 身份不匹配');
    }
    if (completed) {
      throw new Error('PostgreSQL 迁移 journal 在 completed 后仍有记录');
    }
    const mappingKeys = (mapping?: Record<string, number>) =>
      Object.keys(mapping ?? {})
        .map(Number)
        .sort((left, right) => left - right);
    if (entry.phase === 'bootstrap') {
      if (entry !== entries[0]) {
        throw new Error('PostgreSQL 迁移 journal 含重复 bootstrap');
      }
      const expectedToolIds = snapshot.tools.map((tool) => tool.id);
      if (
        JSON.stringify(mappingKeys(entry.mappings.tools)) !==
          JSON.stringify(expectedToolIds) ||
        entry.cursor !== maxId(snapshot.tools)
      ) {
        throw new Error('PostgreSQL 迁移 journal 的 Tool 覆盖或游标无效');
      }
    }
    if (entry.phase === 'jobs') {
      const ids = mappingKeys(entry.mappings.jobs);
      const expected = snapshot.jobs
        .slice(jobOffset, jobOffset + ids.length)
        .map((job) => job.id);
      if (
        ids.length === 0 ||
        JSON.stringify(ids) !== JSON.stringify(expected) ||
        entry.cursor !== ids.at(-1)
      ) {
        throw new Error('PostgreSQL 迁移 journal 的 Job 覆盖或游标无效');
      }
      jobOffset += ids.length;
    }
    if (entry.phase === 'knowledge-items') {
      if (jobOffset !== snapshot.jobs.length) {
        throw new Error(
          'PostgreSQL 迁移 journal 在 Job 未完整覆盖前写入知识条目',
        );
      }
      const ids = mappingKeys(entry.mappings.knowledgeItems);
      const expected = snapshot.knowledgeItems
        .slice(knowledgeOffset, knowledgeOffset + ids.length)
        .map((item) => item.id);
      if (
        ids.length === 0 ||
        JSON.stringify(ids) !== JSON.stringify(expected) ||
        JSON.stringify(mappingKeys(entry.mappings.learningSources)) !==
          JSON.stringify(ids) ||
        JSON.stringify(mappingKeys(entry.mappings.sourceVersions)) !==
          JSON.stringify(ids) ||
        entry.cursor !== ids.at(-1)
      ) {
        throw new Error(
          'PostgreSQL 迁移 journal 的 KnowledgeItem 覆盖或游标无效',
        );
      }
      knowledgeOffset += ids.length;
    }
    if (entry.phase === 'completed') {
      if (
        jobOffset !== snapshot.jobs.length ||
        knowledgeOffset !== snapshot.knowledgeItems.length ||
        entry.cursor !== null ||
        Object.values(entry.mappings).some(
          (mapping) => Object.keys(mapping ?? {}).length > 0,
        )
      ) {
        throw new Error('PostgreSQL 迁移 journal 的 completed 覆盖不完整');
      }
      completed = true;
    }
    Object.assign(sidecar.ids.tools, entry.mappings.tools ?? {});
    Object.assign(sidecar.ids.jobs, entry.mappings.jobs ?? {});
    Object.assign(
      sidecar.ids.knowledgeItems,
      entry.mappings.knowledgeItems ?? {},
    );
    Object.assign(
      sidecar.ids.learningSources,
      entry.mappings.learningSources ?? {},
    );
    Object.assign(
      sidecar.ids.sourceVersions,
      entry.mappings.sourceVersions ?? {},
    );
    sidecar.progress.phase = entry.phase;
    if (entry.phase === 'bootstrap') sidecar.progress.toolCursor = entry.cursor;
    if (entry.phase === 'jobs') sidecar.progress.jobCursor = entry.cursor;
    if (entry.phase === 'knowledge-items') {
      sidecar.progress.knowledgeItemCursor = entry.cursor;
    }
    if (entry.phase === 'completed') {
      sidecar.status = 'completed';
      sidecar.progress.phase = 'completed';
    }
  }
  for (const mapping of Object.values(sidecar.ids)) {
    const values = Object.values(mapping);
    if (new Set(values).size !== values.length) {
      throw new Error('PostgreSQL 迁移 journal 含重复目标 ID 映射');
    }
  }
  return sidecar;
}

function maxId(records: Array<{ id: number }>): number | null {
  return records.length === 0 ? null : records[records.length - 1].id;
}

function canonicalUrls(
  knowledgeItems: LegacyKnowledgeItem[],
): Map<number, string | null> {
  const seen = new Set<string>();
  const result = new Map<number, string | null>();
  for (const item of knowledgeItems) {
    const candidate = item.url.trim() || null;
    if (candidate === null || seen.has(candidate)) {
      result.set(item.id, null);
    } else {
      seen.add(candidate);
      result.set(item.id, candidate);
    }
  }
  return result;
}

export function parseCliArgs(argv: string[]): MigrationOptions {
  const values = new Map<string, string>();
  let dryRun = false;
  const valueOptions = new Set([
    '--source',
    '--target',
    '--initial-admin-email',
    '--id-map',
    '--batch-size',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (!valueOptions.has(argument)) {
      throw new Error(`未知参数：${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} 缺少值`);
    }
    values.set(argument, value);
    index += 1;
  }

  for (const required of ['--source', '--target', '--initial-admin-email']) {
    if (!values.has(required)) {
      throw new Error(`缺少必需参数 ${required}`);
    }
  }
  const source = values.get('--source')!;
  const target = values.get('--target')!;
  const initialAdminEmail = values.get('--initial-admin-email')!;
  validateEmail(normalizeEmail(initialAdminEmail));
  parseTargetUrl(target);
  const batchSizeText = values.get('--batch-size') ?? '100';
  const batchSize = Number(batchSizeText);
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new Error('--batch-size 必须是正整数');
  }

  return {
    source,
    target,
    initialAdminEmail,
    dryRun,
    idMapPath:
      values.get('--id-map') ?? `${resolve(source)}.postgres-id-map.json`,
    batchSize,
  };
}

export class PrismaMigrationTarget implements MigrationTarget {
  private readonly prisma: PrismaClient;
  private readonly targetUrl: string;
  private lockClient: PgLockClient | null = null;

  constructor(targetUrl: string) {
    this.targetUrl = targetUrl;
    this.prisma = new PrismaClient({
      datasources: { db: { url: targetUrl } },
    });
  }

  async acquireMigrationLock(fingerprint: string): Promise<void> {
    if (this.lockClient) {
      throw new Error('迁移锁已由当前进程持有');
    }
    const bytes = Buffer.from(fingerprint, 'hex');
    const firstKey = bytes.readInt32BE(0);
    const secondKey = bytes.readInt32BE(4);
    const pgModule = (await import('pg')) as unknown as PgModule;
    const client = new pgModule.Client({ connectionString: this.targetUrl });
    try {
      await client.connect();
      const result = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired',
        [firstKey, secondKey],
      );
      if (result.rows[0]?.acquired !== true) {
        throw new Error(
          '目标 PostgreSQL 正在执行另一个迁移或预演，无法获取排他锁',
        );
      }
      this.lockClient = client;
    } catch (error) {
      await client.end().catch(() => undefined);
      throw error;
    }
  }

  async releaseMigrationLock(): Promise<void> {
    const client = this.lockClient;
    if (!client) return;
    this.lockClient = null;
    let unlockError: unknown;
    try {
      await client.query<{ released: boolean }>(
        'SELECT pg_advisory_unlock_all() AS released',
      );
    } catch (error) {
      unlockError = error;
    }
    try {
      await client.end();
    } catch (error) {
      if (unlockError === undefined) unlockError = error;
    }
    if (unlockError !== undefined) {
      throw new Error(flattenError(unlockError));
    }
  }

  async getTableCounts(): Promise<Record<string, number>> {
    const tables = await this.prisma.$queryRaw<Array<{ tableName: string }>>`
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const counts: Record<string, number> = {};
    for (const { tableName } of tables) {
      const quotedTable = tableName.replaceAll('"', '""');
      const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "${quotedTable}"`,
      );
      counts[tableName] = Number(rows[0]?.count ?? 0n);
    }
    return counts;
  }

  async loadMigrationJournal(
    importKey: string,
  ): Promise<MigrationJournalRecord[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        correlationId: importKey,
        action: JOURNAL_ACTION,
        targetType: JOURNAL_TARGET_TYPE,
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        result: true,
        targetId: true,
        actorUserId: true,
        targetUserId: true,
        createdAt: true,
        afterMetadata: true,
      },
    });
    return rows;
  }

  private async appendJournal(
    transaction: Prisma.TransactionClient,
    adminId: number,
    identity: MigrationJournalIdentity,
    phase: MigrationJournalEntry['phase'],
    cursor: number | null,
    mappings: MigrationJournalEntry['mappings'],
  ): Promise<void> {
    const entry: MigrationJournalEntry = {
      formatVersion: 1,
      ...identity,
      adminId,
      phase,
      cursor,
      mappings,
    };
    await transaction.auditEvent.create({
      data: {
        actorUserId: adminId,
        targetUserId: adminId,
        targetType: JOURNAL_TARGET_TYPE,
        targetId: identity.importKey,
        action: JOURNAL_ACTION,
        afterMetadata: entry,
        result: 'SUCCESS',
        correlationId: identity.importKey,
      },
    });
  }

  async createBootstrap(input: {
    email: string;
    emailNormalized: string;
    passwordHash: string;
    tools: LegacyTool[];
    journal: MigrationJournalIdentity;
  }): Promise<{ adminId: number; tools: Record<string, number> }> {
    return this.prisma.$transaction(async (transaction) => {
      const admin = await transaction.user.create({
        data: {
          email: input.email,
          emailNormalized: input.emailNormalized,
          passwordHash: input.passwordHash,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
        select: { id: true },
      });
      const tools: Record<string, number> = {};
      for (const legacyTool of input.tools) {
        const tool = await transaction.tool.create({
          data: {
            key: legacyTool.key,
            name: legacyTool.name,
            icon: legacyTool.icon,
            route: legacyTool.route,
            enabled: legacyTool.enabled,
            createdAt: legacyTool.createdAt,
          },
          select: { id: true },
        });
        tools[String(legacyTool.id)] = tool.id;
      }
      await this.appendJournal(
        transaction,
        admin.id,
        input.journal,
        'bootstrap',
        maxId(input.tools),
        { tools },
      );
      return { adminId: admin.id, tools };
    });
  }

  async createJobs(
    adminId: number,
    jobs: LegacyJob[],
    journal: MigrationJournalIdentity,
  ): Promise<Array<{ legacyId: number; targetId: number }>> {
    return this.prisma.$transaction(async (transaction) => {
      const ids: Array<{ legacyId: number; targetId: number }> = [];
      for (const legacyJob of jobs) {
        const job = await transaction.job.create({
          data: {
            userId: adminId,
            toolKey: legacyJob.toolKey,
            status: legacyJob.status,
            input: legacyJob.input,
            output: legacyJob.output,
            error: legacyJob.error,
            retryEligible: legacyJob.status === 'failed',
            attemptCount: 0,
            maxAttempts: 1,
            startedAt: legacyJob.startedAt,
            completedAt: legacyJob.completedAt,
            createdAt: legacyJob.createdAt,
            updatedAt: legacyJob.updatedAt,
          },
          select: { id: true },
        });
        ids.push({ legacyId: legacyJob.id, targetId: job.id });
      }
      await this.appendJournal(
        transaction,
        adminId,
        journal,
        'jobs',
        maxId(jobs),
        {
          jobs: Object.fromEntries(
            ids.map(({ legacyId, targetId }) => [String(legacyId), targetId]),
          ),
        },
      );
      return ids;
    });
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
  }): Promise<
    Array<{
      legacyId: number;
      knowledgeItemId: number;
      learningSourceId: number;
      sourceVersionId: number;
    }>
  > {
    return this.prisma.$transaction(async (transaction) => {
      const ids: Array<{
        legacyId: number;
        knowledgeItemId: number;
        learningSourceId: number;
        sourceVersionId: number;
      }> = [];
      for (const legacyItem of input.items) {
        const knowledgeItem = await transaction.knowledgeItem.create({
          data: {
            userId: input.adminId,
            title: legacyItem.title,
            url: legacyItem.url,
            source: legacyItem.source,
            contentHtml: legacyItem.contentHtml,
            contentMarkdown: legacyItem.contentMarkdown,
            status: legacyItem.status,
            capturedAt: legacyItem.capturedAt,
            jobId: legacyItem.targetJobId,
            createdAt: legacyItem.createdAt,
            updatedAt: legacyItem.updatedAt,
          },
          select: { id: true },
        });
        const learningSource = await transaction.learningSource.create({
          data: {
            userId: input.adminId,
            type: 'WEB',
            title: legacyItem.title,
            canonicalUrl: legacyItem.canonicalUrl,
            status: 'READY',
            createdAt: legacyItem.createdAt,
            updatedAt: legacyItem.updatedAt,
          },
          select: { id: true },
        });
        const sourceVersion = await transaction.sourceVersion.create({
          data: {
            userId: input.adminId,
            sourceId: learningSource.id,
            version: 1,
            contentHash: legacyItem.contentHash,
            contentHtml: legacyItem.contentHtml,
            contentMarkdown: legacyItem.contentMarkdown,
            captureMetadata: {
              legacyKnowledgeItemId: legacyItem.id,
              legacySource: legacyItem.source,
            },
            parsingStage: 'READY',
            parsingQuality: 'GOOD',
            createdAt: legacyItem.createdAt,
          },
          select: { id: true },
        });
        ids.push({
          legacyId: legacyItem.id,
          knowledgeItemId: knowledgeItem.id,
          learningSourceId: learningSource.id,
          sourceVersionId: sourceVersion.id,
        });
      }
      await this.appendJournal(
        transaction,
        input.adminId,
        input.journal,
        'knowledge-items',
        maxId(input.items),
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
    });
  }

  async markCompleted(
    adminId: number,
    journal: MigrationJournalIdentity,
  ): Promise<void> {
    await this.prisma.$transaction((transaction) =>
      this.appendJournal(transaction, adminId, journal, 'completed', null, {}),
    );
  }

  async assertResumeState(
    sidecar: LegacyIdMap,
    snapshot: LegacySnapshot,
    journalEntryCount: number,
  ): Promise<void> {
    const expected: Record<string, number> = {
      User: 1,
      Tool: Object.keys(sidecar.ids.tools).length,
      Job: Object.keys(sidecar.ids.jobs).length,
      KnowledgeItem: Object.keys(sidecar.ids.knowledgeItems).length,
      LearningSource: Object.keys(sidecar.ids.learningSources).length,
      SourceVersion: Object.keys(sidecar.ids.sourceVersions).length,
      AuditEvent: journalEntryCount,
    };
    const tableCounts = await this.getTableCounts();
    for (const [table, count] of Object.entries(tableCounts)) {
      if (table === '_prisma_migrations') continue;
      if (count !== (expected[table] ?? 0)) {
        throw new Error(
          `目标 PostgreSQL 表 ${table} 行数与 journal 不一致，拒绝续传`,
        );
      }
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: sidecar.initialAdmin.id },
      select: { emailNormalized: true, role: true, emailVerifiedAt: true },
    });
    if (
      admin?.emailNormalized !== sidecar.initialAdmin.emailNormalized ||
      admin.role !== 'ADMIN' ||
      admin.emailVerifiedAt === null
    ) {
      throw new Error('非空目标中的初始管理员与 LegacyIdMap 不一致');
    }

    const [tools, jobs, knowledgeItems, learningSources, sourceVersions] =
      await Promise.all([
        this.prisma.tool.findMany({
          where: { id: { in: Object.values(sidecar.ids.tools) } },
        }),
        this.prisma.job.findMany({
          where: { id: { in: Object.values(sidecar.ids.jobs) } },
        }),
        this.prisma.knowledgeItem.findMany({
          where: { id: { in: Object.values(sidecar.ids.knowledgeItems) } },
        }),
        this.prisma.learningSource.findMany({
          where: { id: { in: Object.values(sidecar.ids.learningSources) } },
        }),
        this.prisma.sourceVersion.findMany({
          where: { id: { in: Object.values(sidecar.ids.sourceVersions) } },
        }),
      ]);
    const byId = <T extends { id: number }>(rows: T[]) =>
      new Map(rows.map((row) => [row.id, row]));
    const toolById = byId(tools);
    const jobById = byId(jobs);
    const knowledgeById = byId(knowledgeItems);
    const sourceById = byId(learningSources);
    const versionById = byId(sourceVersions);
    const sameDate = (actual: Date | null, expected: Date | null) =>
      actual?.getTime() === expected?.getTime();

    for (const legacy of snapshot.tools) {
      const targetId = sidecar.ids.tools[String(legacy.id)];
      if (targetId === undefined) continue;
      const row = toolById.get(targetId);
      if (
        !row ||
        row.key !== legacy.key ||
        row.name !== legacy.name ||
        row.icon !== legacy.icon ||
        row.route !== legacy.route ||
        row.enabled !== legacy.enabled ||
        row.createdAt.getTime() !== legacy.createdAt.getTime()
      ) {
        throw new Error(`Tool legacy ID ${legacy.id} 与源快照不一致`);
      }
    }
    for (const legacy of snapshot.jobs) {
      const targetId = sidecar.ids.jobs[String(legacy.id)];
      if (targetId === undefined) continue;
      const row = jobById.get(targetId);
      if (
        !row ||
        row.userId !== sidecar.initialAdmin.id ||
        row.toolKey !== legacy.toolKey ||
        row.status !== legacy.status ||
        row.input !== legacy.input ||
        row.output !== legacy.output ||
        row.error !== legacy.error ||
        !sameDate(row.startedAt, legacy.startedAt) ||
        !sameDate(row.completedAt, legacy.completedAt) ||
        row.createdAt.getTime() !== legacy.createdAt.getTime() ||
        row.updatedAt.getTime() !== legacy.updatedAt.getTime()
      ) {
        throw new Error(`Job legacy ID ${legacy.id} 与源快照不一致`);
      }
    }

    const expectedCanonicalUrls = canonicalUrls(snapshot.knowledgeItems);
    for (const legacy of snapshot.knowledgeItems) {
      const knowledgeTargetId = sidecar.ids.knowledgeItems[String(legacy.id)];
      if (knowledgeTargetId === undefined) continue;
      const expectedJobId =
        legacy.jobId === null ? null : sidecar.ids.jobs[String(legacy.jobId)];
      const knowledge = knowledgeById.get(knowledgeTargetId);
      if (
        expectedJobId === undefined ||
        !knowledge ||
        knowledge.userId !== sidecar.initialAdmin.id ||
        knowledge.jobId !== expectedJobId ||
        knowledge.title !== legacy.title ||
        knowledge.url !== legacy.url ||
        knowledge.source !== legacy.source ||
        knowledge.contentHtml !== legacy.contentHtml ||
        knowledge.contentMarkdown !== legacy.contentMarkdown ||
        knowledge.status !== legacy.status ||
        knowledge.capturedAt.getTime() !== legacy.capturedAt.getTime() ||
        knowledge.createdAt.getTime() !== legacy.createdAt.getTime() ||
        knowledge.updatedAt.getTime() !== legacy.updatedAt.getTime()
      ) {
        throw new Error(`KnowledgeItem legacy ID ${legacy.id} 与源快照不一致`);
      }
      const sourceTargetId = sidecar.ids.learningSources[String(legacy.id)];
      const source = sourceById.get(sourceTargetId);
      if (
        !source ||
        source.userId !== sidecar.initialAdmin.id ||
        source.type !== 'WEB' ||
        source.title !== legacy.title ||
        source.canonicalUrl !== expectedCanonicalUrls.get(legacy.id) ||
        source.status !== 'READY'
      ) {
        throw new Error(`LearningSource legacy ID ${legacy.id} 与源快照不一致`);
      }
      const version = versionById.get(
        sidecar.ids.sourceVersions[String(legacy.id)],
      );
      if (
        !version ||
        version.userId !== sidecar.initialAdmin.id ||
        version.sourceId !== sourceTargetId ||
        version.version !== 1 ||
        version.contentHash !==
          computeContentHash(legacy.contentMarkdown, legacy.contentHtml) ||
        version.contentHtml !== legacy.contentHtml ||
        version.contentMarkdown !== legacy.contentMarkdown
      ) {
        throw new Error(`SourceVersion legacy ID ${legacy.id} 与源快照不一致`);
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

async function checkpoint(
  path: string,
  sidecar: LegacyIdMap,
  afterCheckpoint?: (sidecar: LegacyIdMap) => Promise<void>,
): Promise<void> {
  sidecar.updatedAt = new Date().toISOString();
  await writeSidecarAtomically(path, sidecar);
  await afterCheckpoint?.(sidecar);
}

export async function migrateSqliteToPostgres(
  options: MigrationOptions,
  dependencies: MigrationDependencies = {},
): Promise<MigrationReport> {
  const fingerprint = computeTargetFingerprint(options.target);
  const emailNormalized = normalizeEmail(options.initialAdminEmail);
  validateEmail(emailNormalized);
  if (!Number.isSafeInteger(options.batchSize) || options.batchSize <= 0) {
    throw new Error('--batch-size 必须是正整数');
  }

  const snapshot = await loadLegacySnapshot(options.source);
  assertLegacyIntegrity(snapshot);
  const importKey = migrationImportKey(
    snapshot.sourceFileSha256,
    fingerprint,
    emailNormalized,
  );
  const journalIdentity: MigrationJournalIdentity = {
    importKey,
    sourceFileSha256: snapshot.sourceFileSha256,
    targetFingerprint: fingerprint,
    initialAdminEmailNormalized: emailNormalized,
  };
  const ownedTarget = dependencies.target
    ? null
    : new PrismaMigrationTarget(options.target);
  const target = dependencies.target ?? ownedTarget!;
  let lockAcquired = false;
  let primaryError: Error | undefined;
  let cleanupError: Error | undefined;
  let report: MigrationReport | undefined;

  try {
    report = await (async (): Promise<MigrationReport> => {
      await target.acquireMigrationLock(fingerprint);
      lockAcquired = true;
      const tableCounts = await target.getTableCounts();
      if (options.dryRun) {
        const nonEmptyTables = nonEmptyApplicationTables(tableCounts);
        if (nonEmptyTables.length > 0) {
          throw new Error(
            `目标 PostgreSQL 含有应用数据（${nonEmptyTables.join(', ')}），dry-run 拒绝继续`,
          );
        }
        return reportFor('dry-run', snapshot, fingerprint, emailNormalized);
      }

      const journalEntries = await target.loadMigrationJournal(importKey);
      let sidecar: LegacyIdMap;
      if (journalEntries.length > 0) {
        sidecar = rebuildSidecarFromJournal(
          journalEntries,
          journalIdentity,
          snapshot,
        );
        await target.assertResumeState(
          sidecar,
          snapshot,
          journalEntries.length,
        );
        await writeSidecarAtomically(options.idMapPath, sidecar);
        if (sidecar.status === 'completed') {
          return reportFor(
            'already-completed',
            snapshot,
            fingerprint,
            emailNormalized,
          );
        }
      } else {
        const staleSidecar = await readSidecar(options.idMapPath);
        if (staleSidecar) {
          assertSidecarMatches(
            staleSidecar,
            snapshot.sourceFileSha256,
            fingerprint,
            emailNormalized,
          );
          throw new Error(
            '存在 LegacyIdMap 但 PostgreSQL 无匹配 journal，拒绝信任文件侧状态',
          );
        }
        const nonEmptyTables = nonEmptyApplicationTables(tableCounts);
        if (nonEmptyTables.length > 0) {
          throw new Error(
            `目标 PostgreSQL 含有应用数据（${nonEmptyTables.join(', ')}），且无匹配 journal`,
          );
        }
        const password = randomBytes(32).toString('hex');
        let passwordHash: string;
        if (dependencies.hashPassword) {
          passwordHash = await dependencies.hashPassword(password);
        } else {
          const hashResult: unknown = await hashArgon2(password, {
            type: argon2id,
          });
          if (typeof hashResult !== 'string') {
            throw new Error('Argon2 未返回有效密码哈希');
          }
          passwordHash = hashResult;
        }
        const bootstrap = await target.createBootstrap({
          email: emailNormalized,
          emailNormalized,
          passwordHash,
          tools: snapshot.tools,
          journal: journalIdentity,
        });
        sidecar = {
          formatVersion: 1,
          status: 'running',
          sourceFileSha256: snapshot.sourceFileSha256,
          targetFingerprint: fingerprint,
          initialAdmin: {
            id: bootstrap.adminId,
            emailNormalized,
          },
          ids: {
            tools: bootstrap.tools,
            jobs: {},
            knowledgeItems: {},
            learningSources: {},
            sourceVersions: {},
          },
          progress: {
            phase: 'bootstrap',
            toolCursor: maxId(snapshot.tools),
            jobCursor: null,
            knowledgeItemCursor: null,
          },
          updatedAt: new Date().toISOString(),
        };
        await dependencies.afterDatabaseCommit?.(sidecar);
        await checkpoint(
          options.idMapPath,
          sidecar,
          dependencies.afterCheckpoint,
        );
        sidecar.progress.phase = 'jobs';
      }

      const remainingJobs = snapshot.jobs.filter(
        (job) =>
          sidecar!.progress.jobCursor === null ||
          job.id > sidecar!.progress.jobCursor,
      );
      for (
        let offset = 0;
        offset < remainingJobs.length;
        offset += options.batchSize
      ) {
        const batch = remainingJobs.slice(offset, offset + options.batchSize);
        const ids = await target.createJobs(
          sidecar.initialAdmin.id,
          batch,
          journalIdentity,
        );
        for (const id of ids) {
          sidecar.ids.jobs[String(id.legacyId)] = id.targetId;
        }
        sidecar.progress.phase = 'jobs';
        sidecar.progress.jobCursor = maxId(batch);
        await dependencies.afterDatabaseCommit?.(sidecar);
        await checkpoint(
          options.idMapPath,
          sidecar,
          dependencies.afterCheckpoint,
        );
      }

      sidecar.progress.phase = 'knowledge-items';
      const urls = canonicalUrls(snapshot.knowledgeItems);
      const remainingItems = snapshot.knowledgeItems.filter(
        (item) =>
          sidecar!.progress.knowledgeItemCursor === null ||
          item.id > sidecar!.progress.knowledgeItemCursor,
      );
      for (
        let offset = 0;
        offset < remainingItems.length;
        offset += options.batchSize
      ) {
        const batch = remainingItems.slice(offset, offset + options.batchSize);
        const prepared = batch.map((item) => {
          const targetJobId =
            item.jobId === null ? null : sidecar!.ids.jobs[String(item.jobId)];
          if (item.jobId !== null && targetJobId === undefined) {
            throw new Error(
              `Job legacy ID ${item.jobId} 尚无目标映射，拒绝丢失关联`,
            );
          }
          return {
            ...item,
            targetJobId,
            canonicalUrl: urls.get(item.id) ?? null,
            contentHash: computeContentHash(
              item.contentMarkdown,
              item.contentHtml,
            ),
          };
        });
        const ids = await target.createKnowledgeItems({
          adminId: sidecar.initialAdmin.id,
          journal: journalIdentity,
          items: prepared,
        });
        for (const id of ids) {
          const legacyId = String(id.legacyId);
          sidecar.ids.knowledgeItems[legacyId] = id.knowledgeItemId;
          sidecar.ids.learningSources[legacyId] = id.learningSourceId;
          sidecar.ids.sourceVersions[legacyId] = id.sourceVersionId;
        }
        sidecar.progress.phase = 'knowledge-items';
        sidecar.progress.knowledgeItemCursor = maxId(batch);
        await dependencies.afterDatabaseCommit?.(sidecar);
        await checkpoint(
          options.idMapPath,
          sidecar,
          dependencies.afterCheckpoint,
        );
      }

      const finalSourceHash = digest(await readFile(resolve(options.source)));
      if (finalSourceHash !== snapshot.sourceFileSha256) {
        throw new Error(
          '源 SQLite 在迁移期间发生变化，拒绝写入 completed journal',
        );
      }
      await target.markCompleted(sidecar.initialAdmin.id, journalIdentity);
      sidecar.status = 'completed';
      sidecar.progress.phase = 'completed';
      await dependencies.afterDatabaseCommit?.(sidecar);
      await checkpoint(
        options.idMapPath,
        sidecar,
        dependencies.afterCheckpoint,
      );
      return reportFor('completed', snapshot, fingerprint, emailNormalized);
    })();
  } catch (error) {
    primaryError = new Error(sanitizeTargetError(error, options.target));
  } finally {
    const cleanupMessages: string[] = [];
    if (lockAcquired) {
      try {
        await target.releaseMigrationLock();
      } catch (error) {
        cleanupMessages.push(sanitizeTargetError(error, options.target));
      }
    }
    if (ownedTarget) {
      try {
        await ownedTarget.disconnect();
      } catch (error) {
        cleanupMessages.push(sanitizeTargetError(error, options.target));
      }
    }
    if (cleanupMessages.length > 0) {
      cleanupError = new Error(cleanupMessages.join('；'));
    }
  }

  if (primaryError) {
    throw primaryError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
  if (!report) {
    throw new Error('迁移未返回结果');
  }
  return report;
}

async function runCli(): Promise<void> {
  let options: MigrationOptions | undefined;
  try {
    options = parseCliArgs(process.argv.slice(2));
    console.log(
      options.dryRun ? '阶段：SQLite 只读预演' : '阶段：SQLite 单向导入',
    );
    const report = await migrateSqliteToPostgres(options);
    console.log(`状态：${report.status}`);
    console.log(`源文件 SHA-256：${report.sourceFileSha256.slice(0, 12)}…`);
    console.log(`目标指纹：${report.targetFingerprint.slice(0, 12)}…`);
    console.log(
      `计数：Tool=${report.counts.tools}，Job=${report.counts.jobs}，KnowledgeItem=${report.counts.knowledgeItems}，LearningSource=${report.counts.learningSources}，SourceVersion=${report.counts.sourceVersions}`,
    );
    console.log(`跳过旧 ApiToken：${report.counts.apiTokensSkipped}`);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const message = options
      ? sanitizeMessage(raw, options.target)
      : sanitizeCliError(raw);
    console.error(`迁移失败：${message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void runCli();
}

export { EMPTY_COUNTS };
