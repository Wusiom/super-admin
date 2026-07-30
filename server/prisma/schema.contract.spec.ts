import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type SchemaBlock = {
  name: string;
  body: string;
  fields: Map<string, string>;
  directives: string[];
};

type ParsedSchema = {
  datasource: SchemaBlock;
  models: Map<string, SchemaBlock>;
  enums: Map<string, SchemaBlock>;
};

function parseBlock(kind: string, name: string, body: string): SchemaBlock {
  const fields = new Map<string, string>();
  const directives: string[] = [];

  for (const rawLine of body.split(/\r?\n/u)) {
    const line = rawLine.replace(/\/\/.*$/u, '').trim();
    if (!line) continue;
    if (line.startsWith('@@')) {
      directives.push(line.replace(/\s+/gu, ' '));
      continue;
    }
    if (kind === 'enum') {
      fields.set(line.split(/\s+/u)[0], line);
      continue;
    }
    const match = line.match(/^(\w+)\s+([^\s]+)(?:\s+(.*))?$/u);
    if (match) fields.set(match[1], `${match[2]} ${match[3] ?? ''}`.trim());
  }

  return { name, body, fields, directives };
}

function parseSchema(source: string): ParsedSchema {
  const blocks = new Map<string, SchemaBlock>();
  const pattern = /\b(datasource|model|enum)\s+(\w+)\s*\{([\s\S]*?)\}/gu;
  for (const match of source.matchAll(pattern)) {
    const [, kind, name, body] = match;
    blocks.set(`${kind}:${name}`, parseBlock(kind, name, body));
  }

  const datasource = blocks.get('datasource:db');
  if (!datasource) throw new Error('缺少 datasource db');

  return {
    datasource,
    models: new Map(
      [...blocks.entries()]
        .filter(([key]) => key.startsWith('model:'))
        .map(([key, value]) => [key.slice('model:'.length), value]),
    ),
    enums: new Map(
      [...blocks.entries()]
        .filter(([key]) => key.startsWith('enum:'))
        .map(([key, value]) => [key.slice('enum:'.length), value]),
    ),
  };
}

function expectField(
  schema: ParsedSchema,
  modelName: string,
  fieldName: string,
  pattern: RegExp,
) {
  const model = schema.models.get(modelName);
  expect(model).toBeDefined();
  const field = model?.fields.get(fieldName);
  expect(field).toBeDefined();
  expect(field).toMatch(pattern);
}

function expectDirective(
  schema: ParsedSchema,
  modelName: string,
  pattern: RegExp,
) {
  const directives = schema.models.get(modelName)?.directives ?? [];
  expect(directives.some((directive) => pattern.test(directive))).toBe(true);
}

const source = readFileSync(join(__dirname, 'schema.prisma'), 'utf8');
const schema = parseSchema(source);

describe('PostgreSQL 完整领域 Schema 合同', () => {
  it('使用 PostgreSQL 并声明 OpenSpec 2.2—2.5 的全部模型', () => {
    expect(schema.datasource.fields.get('provider')).toMatch(/"postgresql"/u);

    const requiredModels = [
      'User',
      'WebSession',
      'EmailToken',
      'PasswordResetToken',
      'ApiToken',
      'AuditEvent',
      'LearningSource',
      'SourceVersion',
      'SourceAnchor',
      'Concept',
      'LearningUnit',
      'LearningProject',
      'LearningContract',
      'LearningContractUnit',
      'TutoringSession',
      'TutoringTurn',
      'UnderstandingEvidence',
      'ConceptState',
      'LearnerStrategy',
      'ProfileEvidence',
      'ProfileEvidence',
      'AtomicNote',
      'AtomicNoteLink',
      'ModelProvider',
      'ModelProfile',
      'PromptVersion',
      'ModelCall',
      'QuotaPolicy',
      'UserQuotaOverride',
    ];

    expect([...schema.models.keys()]).toEqual(
      expect.arrayContaining(requiredModels),
    );
  });

  it('使用受限枚举表达身份、来源、解析、辅导、笔记、审计和配额状态', () => {
    const expectedEnums: Record<string, string[]> = {
      Role: ['USER', 'ADMIN'],
      UserStatus: ['ACTIVE', 'DISABLED'],
      SourceType: ['WEB', 'EPUB', 'PDF'],
      ParsingStage: [
        'PENDING',
        'VALIDATED',
        'EXTRACTED',
        'ANCHORED',
        'MAPPED',
        'READY',
        'FAILED',
      ],
      ParsingQuality: ['GOOD', 'LOW_CONFIDENCE', 'SCANNED_UNSUPPORTED'],
      TutorActionKind: [
        'EXPLAIN',
        'ASK_RECALL',
        'ASK_SELF_EXPLAIN',
        'ASK_TRANSFER',
        'GIVE_HINT',
        'GIVE_EXAMPLE',
        'COMPARE',
        'CHALLENGE',
        'SUMMARIZE',
        'MAKE_NOTE',
      ],
      EvaluationOutcome: [
        'UNSUPPORTED',
        'PARTIAL',
        'SOUND',
        'TRANSFER_VALIDATED',
      ],
      UnderstandingLevel: [
        'UNSEEN',
        'RECALLABLE',
        'EXPLAINABLE',
        'TRANSFER_VALIDATED',
      ],
      NoteStatus: ['DRAFT', 'CONFIRMED', 'REJECTED'],
      NoteLinkStatus: ['SUGGESTED', 'CONFIRMED', 'REJECTED'],
      AuditResult: ['SUCCESS', 'REJECTED', 'FAILED'],
      QuotaMetric: [
        'MODEL_TOKENS',
        'STORAGE_BYTES',
        'FILE_SIZE_BYTES',
        'CONCURRENT_SESSIONS',
      ],
    };

    for (const [enumName, values] of Object.entries(expectedEnums)) {
      const enumBlock = schema.enums.get(enumName);
      expect(enumBlock).toBeDefined();
      expect([...enumBlock!.fields.keys()]).toEqual(
        expect.arrayContaining(values),
      );
    }
    expect([...schema.enums.get('TutorActionKind')!.fields.keys()]).toEqual(
      expectedEnums.TutorActionKind,
    );
  });

  it('所有用户拥有的根实体都有必需 userId 与 User 外键', () => {
    const ownedRoots = [
      'WebSession',
      'EmailToken',
      'PasswordResetToken',
      'ApiToken',
      'Job',
      'KnowledgeItem',
      'LearningSource',
      'SourceVersion',
      'LearningProject',
      'LearningContract',
      'LearningContractUnit',
      'TutoringSession',
      'TutoringTurn',
      'UnderstandingEvidence',
      'ConceptState',
      'LearnerStrategy',
      'AtomicNote',
      'AtomicNoteLink',
      'ModelCall',
      'UserQuotaOverride',
    ];

    for (const modelName of ownedRoots) {
      expectField(schema, modelName, 'userId', /^Int\b/u);
      expectField(
        schema,
        modelName,
        'user',
        /^User\s+@relation\(fields:\s*\[userId\],\s*references:\s*\[id\]/u,
      );
      expectDirective(
        schema,
        modelName,
        /@@(?:index|unique)\(\[userId(?:,|\])/u,
      );
    }
  });

  it('身份凭据只保存哈希，并可过期、消费、轮换或撤销', () => {
    expectField(schema, 'User', 'emailNormalized', /^String\s+@unique\b/u);
    expectField(schema, 'User', 'passwordHash', /^String\b/u);
    expectDirective(schema, 'User', /@@index\(\[role, status\]\)/u);

    for (const modelName of [
      'WebSession',
      'EmailToken',
      'PasswordResetToken',
    ]) {
      expectField(schema, modelName, 'tokenHash', /^String\s+@unique\b/u);
      expectField(schema, modelName, 'expiresAt', /^DateTime\b/u);
      expectField(schema, modelName, 'revokedAt', /^DateTime\?/u);
    }
    expectField(schema, 'WebSession', 'familyId', /^String\b/u);
    expectField(schema, 'WebSession', 'rotatedAt', /^DateTime\?/u);
    expectField(schema, 'EmailToken', 'consumedAt', /^DateTime\?/u);
    expectField(schema, 'PasswordResetToken', 'consumedAt', /^DateTime\?/u);

    expectField(schema, 'ApiToken', 'tokenHash', /^String\s+@unique\b/u);
    expectField(schema, 'ApiToken', 'scopes', /^String\[\]/u);
    expectField(schema, 'ApiToken', 'lastUsedAt', /^DateTime\?/u);
    expectField(schema, 'ApiToken', 'revokedAt', /^DateTime\?/u);
  });

  it('来源版本、锚点、概念、单元和项目固定到不可变版本', () => {
    expectDirective(
      schema,
      'LearningSource',
      /@@unique\(\[userId, canonicalUrl\]\)/u,
    );
    expectField(schema, 'SourceVersion', 'version', /^Int\b/u);
    expectField(schema, 'SourceVersion', 'contentHash', /^String\b/u);
    expectField(
      schema,
      'SourceVersion',
      'createdAt',
      /^DateTime\s+@default\(now\(\)\)/u,
    );
    expectDirective(
      schema,
      'SourceVersion',
      /@@unique\(\[sourceId, version\]\)/u,
    );
    expectDirective(
      schema,
      'SourceVersion',
      /@@unique\(\[sourceId, contentHash\]\)/u,
    );
    expectDirective(
      schema,
      'SourceAnchor',
      /@@unique\(\[sourceVersionId, key\]\)/u,
    );

    for (const modelName of [
      'SourceAnchor',
      'Concept',
      'LearningUnit',
      'LearningProject',
    ]) {
      expectField(schema, modelName, 'sourceVersionId', /^Int\b/u);
      expectField(
        schema,
        modelName,
        'sourceVersion',
        /^SourceVersion\s+@relation\(fields:\s*\[sourceVersionId(?:,\s*\w+)*\],\s*references:\s*\[id(?:,\s*\w+)*\]/u,
      );
    }
    expectDirective(schema, 'Concept', /@@unique\(\[sourceVersionId, key\]\)/u);
    expectDirective(
      schema,
      'LearningUnit',
      /@@unique\(\[sourceVersionId, position\]\)/u,
    );
    expectDirective(
      schema,
      'LearningContract',
      /@@unique\(\[projectId, version\]\)/u,
    );
  });

  it('学习契约用显式连接表固定项目版本和已确认单元', () => {
    expect(
      schema.models.get('LearningContract')?.fields.has('confirmedUnitIds'),
    ).toBe(false);
    expectField(schema, 'LearningContract', 'sourceVersionId', /^Int\b/u);
    expectField(
      schema,
      'LearningContract',
      'project',
      /^LearningProject\s+@relation\(fields:\s*\[projectId, userId, sourceVersionId\],\s*references:\s*\[id, userId, sourceVersionId\]/u,
    );
    expectField(
      schema,
      'LearningContractUnit',
      'contract',
      /^LearningContract\s+@relation\(fields:\s*\[contractId, userId, sourceVersionId\],\s*references:\s*\[id, userId, sourceVersionId\]/u,
    );
    expectField(
      schema,
      'LearningContractUnit',
      'learningUnit',
      /^LearningUnit\s+@relation\(fields:\s*\[learningUnitId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
    );
    expectDirective(
      schema,
      'LearningContractUnit',
      /@@unique\(\[contractId, learningUnitId\]\)/u,
    );
    expectDirective(
      schema,
      'LearningContractUnit',
      /@@unique\(\[contractId, position\]\)/u,
    );
  });

  it('用户拥有的父子关系使用复合外键阻止跨用户错配', () => {
    const ownershipRelations: Array<[string, string, RegExp]> = [
      [
        'KnowledgeItem',
        'job',
        /^Job\?\s+@relation\(fields:\s*\[jobId, userId\],\s*references:\s*\[id, userId\]/u,
      ],
      [
        'SourceVersion',
        'source',
        /^LearningSource\s+@relation\(fields:\s*\[sourceId, userId\],\s*references:\s*\[id, userId\]/u,
      ],
      [
        'LearningProject',
        'source',
        /^LearningSource\s+@relation\(fields:\s*\[sourceId, userId\],\s*references:\s*\[id, userId\]/u,
      ],
      [
        'LearningProject',
        'sourceVersion',
        /^SourceVersion\s+@relation\(fields:\s*\[sourceVersionId, userId, sourceId\],\s*references:\s*\[id, userId, sourceId\]/u,
      ],
      [
        'LearningContract',
        'project',
        /^LearningProject\s+@relation\(fields:\s*\[projectId, userId, sourceVersionId\],\s*references:\s*\[id, userId, sourceVersionId\]/u,
      ],
      [
        'TutoringSession',
        'project',
        /^LearningProject\s+@relation\(fields:\s*\[projectId, userId, sourceVersionId\],\s*references:\s*\[id, userId, sourceVersionId\]/u,
      ],
      [
        'TutoringSession',
        'learningContract',
        /^LearningContract\s+@relation\(fields:\s*\[learningContractId, userId, projectId, sourceVersionId\],\s*references:\s*\[id, userId, projectId, sourceVersionId\]/u,
      ],
      [
        'TutoringTurn',
        'session',
        /^TutoringSession\s+@relation\(fields:\s*\[sessionId, userId, sourceVersionId\],\s*references:\s*\[id, userId, sourceVersionId\]/u,
      ],
      [
        'UnderstandingEvidence',
        'turn',
        /^TutoringTurn\s+@relation\(fields:\s*\[turnId, userId, sessionId, sourceVersionId\],\s*references:\s*\[id, userId, sessionId, sourceVersionId\]/u,
      ],
      [
        'ConceptState',
        'project',
        /^LearningProject\s+@relation\(fields:\s*\[projectId, userId, sourceVersionId\],\s*references:\s*\[id, userId, sourceVersionId\]/u,
      ],
      [
        'AtomicNote',
        'sourceTurn',
        /^TutoringTurn\s+@relation\(fields:\s*\[sourceTurnId, userId, tutoringSessionId, sourceVersionId\],\s*references:\s*\[id, userId, sessionId, sourceVersionId\]/u,
      ],
      [
        'AtomicNoteLink',
        'sourceNote',
        /^AtomicNote\s+@relation\("AtomicNoteSource",\s*fields:\s*\[sourceNoteId, userId\],\s*references:\s*\[id, userId\]/u,
      ],
      [
        'AtomicNoteLink',
        'targetNote',
        /^AtomicNote\s+@relation\("AtomicNoteTarget",\s*fields:\s*\[targetNoteId, userId\],\s*references:\s*\[id, userId\]/u,
      ],
      [
        'ModelCall',
        'tutoringSession',
        /^TutoringSession\?\s+@relation\(fields:\s*\[tutoringSessionId, userId\],\s*references:\s*\[id, userId\]/u,
      ],
      [
        'ModelCall',
        'tutoringTurn',
        /^TutoringTurn\?\s+@relation\(fields:\s*\[tutoringTurnId, userId\],\s*references:\s*\[id, userId\]/u,
      ],
    ];

    for (const [modelName, fieldName, pattern] of ownershipRelations) {
      expectField(schema, modelName, fieldName, pattern);
    }
  });

  it('来源硬删除沿唯一主包含路径级联，次级一致性外键不提前阻断', () => {
    const deleteRelations: Array<[string, string, RegExp]> = [
      ['SourceVersion', 'source', /onDelete:\s*Cascade\)$/u],
      ['SourceSection', 'parent', /onDelete:\s*NoAction\)$/u],
      ['SourceChunk', 'section', /onDelete:\s*NoAction\)$/u],
      ['SourceAnchor', 'section', /onDelete:\s*NoAction\)$/u],
      ['SourceAnchor', 'chunk', /onDelete:\s*NoAction\)$/u],
      ['ConceptDependency', 'prerequisiteConcept', /onDelete:\s*NoAction\)$/u],
      ['ConceptDependency', 'dependentConcept', /onDelete:\s*NoAction\)$/u],
      ['ConceptAnchor', 'concept', /onDelete:\s*Cascade\)$/u],
      ['ConceptAnchor', 'anchor', /onDelete:\s*NoAction\)$/u],
      ['LearningUnitConcept', 'learningUnit', /onDelete:\s*Cascade\)$/u],
      ['LearningUnitConcept', 'concept', /onDelete:\s*NoAction\)$/u],
      ['LearningUnitAnchor', 'learningUnit', /onDelete:\s*Cascade\)$/u],
      ['LearningUnitAnchor', 'anchor', /onDelete:\s*NoAction\)$/u],
      ['LearningProject', 'source', /onDelete:\s*Cascade\)$/u],
      ['LearningProject', 'sourceVersion', /onDelete:\s*NoAction\)$/u],
      ['LearningContract', 'project', /onDelete:\s*Cascade\)$/u],
      ['LearningContract', 'sourceVersion', /onDelete:\s*NoAction\)$/u],
      ['LearningContractUnit', 'contract', /onDelete:\s*Cascade\)$/u],
      ['LearningContractUnit', 'learningUnit', /onDelete:\s*NoAction\)$/u],
      ['TutoringSession', 'project', /onDelete:\s*Cascade\)$/u],
      ['TutoringSession', 'learningContract', /onDelete:\s*NoAction\)$/u],
      ['TutoringSession', 'sourceVersion', /onDelete:\s*NoAction\)$/u],
      ['TutoringTurn', 'session', /onDelete:\s*Cascade\)$/u],
      ['UnderstandingEvidence', 'session', /onDelete:\s*NoAction\)$/u],
      ['UnderstandingEvidence', 'turn', /onDelete:\s*Cascade\)$/u],
      ['UnderstandingEvidence', 'concept', /onDelete:\s*NoAction\)$/u],
      ['ConceptState', 'project', /onDelete:\s*Cascade\)$/u],
      ['ConceptState', 'concept', /onDelete:\s*NoAction\)$/u],
      ['AtomicNote', 'tutoringSession', /onDelete:\s*Cascade\)$/u],
      ['AtomicNote', 'sourceTurn', /onDelete:\s*NoAction\)$/u],
      ['AtomicNote', 'sourceVersion', /onDelete:\s*NoAction\)$/u],
      ['ModelCall', 'tutoringSession', /onDelete:\s*Cascade\)$/u],
      ['ModelCall', 'tutoringTurn', /onDelete:\s*NoAction\)$/u],
      ['EvidenceAnchor', 'evidence', /onDelete:\s*Cascade\)$/u],
      ['EvidenceAnchor', 'anchor', /onDelete:\s*NoAction\)$/u],
      ['AtomicNoteAnchor', 'note', /onDelete:\s*Cascade\)$/u],
      ['AtomicNoteAnchor', 'anchor', /onDelete:\s*NoAction\)$/u],
    ];

    for (const [modelName, fieldName, pattern] of deleteRelations) {
      expectField(schema, modelName, fieldName, pattern);
    }
  });

  it('内容图与证据连接表使用来源版本复合外键阻止跨版本引用', () => {
    const versionRelations: Array<[string, string, RegExp]> = [
      [
        'ConceptDependency',
        'prerequisiteConcept',
        /^Concept\s+@relation\("ConceptPrerequisite",\s*fields:\s*\[prerequisiteConceptId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
      [
        'ConceptDependency',
        'dependentConcept',
        /^Concept\s+@relation\("ConceptDependent",\s*fields:\s*\[dependentConceptId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
      [
        'ConceptAnchor',
        'concept',
        /^Concept\s+@relation\(fields:\s*\[conceptId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
      [
        'ConceptAnchor',
        'anchor',
        /^SourceAnchor\s+@relation\(fields:\s*\[anchorId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
      [
        'LearningUnitConcept',
        'concept',
        /^Concept\s+@relation\(fields:\s*\[conceptId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
      [
        'LearningUnitConcept',
        'learningUnit',
        /^LearningUnit\s+@relation\(fields:\s*\[learningUnitId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
      [
        'LearningUnitAnchor',
        'anchor',
        /^SourceAnchor\s+@relation\(fields:\s*\[anchorId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
      [
        'LearningUnitAnchor',
        'learningUnit',
        /^LearningUnit\s+@relation\(fields:\s*\[learningUnitId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
      [
        'EvidenceAnchor',
        'anchor',
        /^SourceAnchor\s+@relation\(fields:\s*\[anchorId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
      [
        'EvidenceAnchor',
        'evidence',
        /^UnderstandingEvidence\s+@relation\(fields:\s*\[evidenceId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
      [
        'AtomicNoteAnchor',
        'anchor',
        /^SourceAnchor\s+@relation\(fields:\s*\[anchorId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
      [
        'AtomicNoteAnchor',
        'note',
        /^AtomicNote\s+@relation\(fields:\s*\[noteId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
      ],
    ];

    for (const [modelName, fieldName, pattern] of versionRelations) {
      expectField(schema, modelName, fieldName, pattern);
    }
  });

  it('辅导运行以版本、轮次和确定性幂等键保护领域写入', () => {
    expectField(schema, 'TutoringSession', 'sourceVersionId', /^Int\b/u);
    expectField(
      schema,
      'TutoringSession',
      'graphThreadId',
      /^String\s+@unique\b/u,
    );
    expectDirective(
      schema,
      'TutoringTurn',
      /@@unique\(\[sessionId, position\]\)/u,
    );
    expectDirective(
      schema,
      'TutoringTurn',
      /@@unique\(\[sessionId, idempotencyKey\]\)/u,
    );
    expectField(schema, 'TutoringTurn', 'actionKind', /^TutorActionKind\?/u);
    expectField(
      schema,
      'TutoringTurn',
      'targetConcept',
      /^Concept\?\s+@relation\(fields:\s*\[targetConceptId, sourceVersionId\],\s*references:\s*\[id, sourceVersionId\]/u,
    );
    expectField(schema, 'UnderstandingEvidence', 'operationType', /^String\b/u);
    expectDirective(
      schema,
      'UnderstandingEvidence',
      /@@unique\(\[sessionId, turnId, operationType\]\)/u,
    );
    expectDirective(
      schema,
      'ConceptState',
      /@@unique\(\[projectId, conceptId\]\)/u,
    );
    expectField(
      schema,
      'ConceptState',
      'latestEvidence',
      /^UnderstandingEvidence\?\s+@relation\("LatestConceptEvidence",\s*fields:\s*\[latestEvidenceId, userId, sourceVersionId, conceptId\],\s*references:\s*\[id, userId, sourceVersionId, conceptId\]/u,
    );
    expectDirective(
      schema,
      'LearnerStrategy',
      /@@unique\(\[userId, strategyKey\]\)/u,
    );
    expectDirective(
      schema,
      'ProfileEvidence',
      /@@unique\(\[strategyId, evidenceId\]\)/u,
    );
  });

  it('原子笔记保留用户答案、来源版本、确认状态和所有者内链接', () => {
    expectField(schema, 'AtomicNote', 'sourceVersionId', /^Int\b/u);
    expectField(schema, 'AtomicNote', 'sourceTurnId', /^Int\b/u);
    expectField(schema, 'AtomicNote', 'tutoringSessionId', /^Int\b/u);
    expectField(schema, 'AtomicNote', 'userAnswer', /^String\b/u);
    expectField(schema, 'AtomicNote', 'confirmedAt', /^DateTime\?/u);
    expectDirective(
      schema,
      'AtomicNote',
      /@@unique\(\[userId, idempotencyKey\]\)/u,
    );
    expectField(schema, 'AtomicNoteLink', 'userId', /^Int\b/u);
    expectDirective(
      schema,
      'AtomicNoteLink',
      /@@unique\(\[userId, sourceNoteId, targetNoteId, relationType\]\)/u,
    );
  });

  it('模型、Prompt、调用和配额具备版本选择与运营索引', () => {
    expectField(schema, 'ModelProvider', 'encryptedApiKey', /^String\b/u);
    expectDirective(schema, 'ModelProfile', /@@unique\(\[name, version\]\)/u);
    expectDirective(schema, 'PromptVersion', /@@unique\(\[kind, version\]\)/u);
    expectField(schema, 'ModelCall', 'promptVersionId', /^Int\b/u);
    expectField(schema, 'ModelCall', 'inputTokens', /^Int\b/u);
    expectField(schema, 'ModelCall', 'outputTokens', /^Int\b/u);
    expectField(schema, 'ModelCall', 'sanitizedError', /^String\?/u);
    expectDirective(schema, 'QuotaPolicy', /@@unique\(\[metric\]\)/u);
    expectDirective(
      schema,
      'UserQuotaOverride',
      /@@unique\(\[userId, metric\]\)/u,
    );
  });

  it('Job 保留旧字段并增加所有权、安全元数据、重试、时间和幂等约束', () => {
    for (const legacyField of [
      'toolKey',
      'status',
      'input',
      'output',
      'error',
      'bullmqJobId',
    ]) {
      expect(schema.models.get('Job')?.fields.has(legacyField)).toBe(true);
    }
    expectField(schema, 'Job', 'inputMetadata', /^Json\?/u);
    expectField(schema, 'Job', 'outputMetadata', /^Json\?/u);
    expectField(schema, 'Job', 'errorCategory', /^String\?/u);
    expectField(schema, 'Job', 'retryEligible', /^Boolean\b/u);
    expectField(schema, 'Job', 'attemptCount', /^Int\b/u);
    expectField(schema, 'Job', 'maxAttempts', /^Int\b/u);
    expectField(schema, 'Job', 'startedAt', /^DateTime\?/u);
    expectField(schema, 'Job', 'completedAt', /^DateTime\?/u);
    expectField(schema, 'Job', 'idempotencyKey', /^String\?/u);
    expectDirective(
      schema,
      'Job',
      /@@unique\(\[userId, toolKey, idempotencyKey\]\)/u,
    );
    expectDirective(schema, 'Job', /@@unique\(\[toolKey, bullmqJobId\]\)/u);
    expectDirective(
      schema,
      'Job',
      /@@index\(\[userId, createdAt(?:\(sort: Desc\))?\]/u,
    );
    expectDirective(
      schema,
      'Job',
      /@@index\(\[toolKey, status, createdAt(?:\(sort: Desc\))?\]/u,
    );
  });

  it('审计记录不可缺少操作者、目标、前后元数据、结果和关联 ID', () => {
    expectField(schema, 'AuditEvent', 'actorUserId', /^Int\?/u);
    expectField(schema, 'AuditEvent', 'targetType', /^String\b/u);
    expectField(schema, 'AuditEvent', 'targetId', /^String\?/u);
    expectField(schema, 'AuditEvent', 'reason', /^String\?/u);
    expectField(schema, 'AuditEvent', 'beforeMetadata', /^Json\?/u);
    expectField(schema, 'AuditEvent', 'afterMetadata', /^Json\?/u);
    expectField(schema, 'AuditEvent', 'result', /^AuditResult\b/u);
    expectField(schema, 'AuditEvent', 'correlationId', /^String\b/u);
    expectDirective(
      schema,
      'AuditEvent',
      /@@index\(\[actorUserId, createdAt\]/u,
    );
    expectDirective(
      schema,
      'AuditEvent',
      /@@index\(\[action, result, createdAt\]/u,
    );
  });
});
