import { z } from 'zod';

const portSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return Number(value);
    }

    return value;
  },
  z
    .number()
    .int('必须是整数')
    .min(1, '必须大于等于 1')
    .max(65535, '必须小于等于 65535'),
);

const booleanSchema = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((value) =>
    typeof value === 'boolean' ? value : value === 'true',
  );

const httpUrlSchema = z
  .string()
  .url('必须是合法 URL')
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: '仅支持 http 或 https 协议',
  });

const secretStringSchema = (minimumLength: number, lengthMessage: string) =>
  z
    .string()
    .min(minimumLength, lengthMessage)
    .refine((value) => value === value.trim(), {
      message: '不能包含首尾空白',
    });

const databaseUrlSchema = z
  .string()
  .min(1, '不能为空')
  .superRefine((value, context) => {
    if (value !== value.trim()) {
      context.addIssue({ code: 'custom', message: '不能包含首尾空白' });
      return;
    }

    if (value.startsWith('file:')) {
      const fileReference = value.slice('file:'.length);
      const parameterStart = fileReference.search(/[?#]/);
      const filePath =
        parameterStart === -1
          ? fileReference
          : fileReference.slice(0, parameterStart);
      const lastPathSegment = filePath.split(/[\\/]/).at(-1);
      if (
        filePath !== filePath.trim() ||
        filePath.length === 0 ||
        filePath.startsWith('//') ||
        /[\\/]$/.test(filePath) ||
        !lastPathSegment ||
        ['.', '..'].includes(lastPathSegment)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'file: 地址必须包含具体数据库文件路径',
        });
      }
      return;
    }

    try {
      const url = new URL(value);
      if (!['postgresql:', 'postgres:'].includes(url.protocol)) {
        context.addIssue({
          code: 'custom',
          message: '仅支持 file、postgresql 或 postgres 协议',
        });
      } else if (!url.hostname) {
        context.addIssue({
          code: 'custom',
          message: 'PostgreSQL 地址必须包含主机名',
        });
      } else if (
        url.pathname.length <= 1 ||
        decodeURIComponent(url.pathname.slice(1)).trim().length === 0
      ) {
        context.addIssue({
          code: 'custom',
          message: 'PostgreSQL 地址必须包含数据库路径',
        });
      }
    } catch {
      context.addIssue({ code: 'custom', message: '必须是合法数据库地址' });
    }
  });

const objectStorageBucketSchema = z
  .string()
  .min(3, '长度不能少于 3 个字符')
  .max(63, '长度不能超过 63 个字符')
  .regex(
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/,
    '只能包含小写字母、数字、点和连字符，且必须以字母或数字开头和结尾',
  )
  .refine((value) => !value.includes('..'), {
    message: '不能包含连续的点',
  })
  .refine((value) => !value.includes('.-') && !value.includes('-.'), {
    message: '点和连字符不能相邻',
  })
  .refine((value) => !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value), {
    message: '不能使用 IPv4 地址格式',
  });

export const environmentSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  JWT_ACCESS_SECRET: secretStringSchema(32, '长度不能少于 32 个字符'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, '必须是 64 位十六进制字符串（32 字节）'),
  REDIS_HOST: z.string().trim().min(1, '不能为空'),
  REDIS_PORT: portSchema,
  OBJECT_STORAGE_ENDPOINT: httpUrlSchema,
  OBJECT_STORAGE_BUCKET: objectStorageBucketSchema,
  OBJECT_STORAGE_ACCESS_KEY: secretStringSchema(1, '不能为空'),
  OBJECT_STORAGE_SECRET_KEY: secretStringSchema(1, '不能为空'),
  SMTP_HOST: z.string().trim().min(1, '不能为空'),
  SMTP_PORT: portSchema,
  SMTP_SECURE: booleanSchema,
  SMTP_FROM: z.string().email('必须是合法邮箱地址'),
  APP_PUBLIC_URL: httpUrlSchema,
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(raw: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `${issue.path.join('.') || 'environment'}：${issue.message}`,
      )
      .join('；');

    throw new Error(`环境变量校验失败：${details}`);
  }

  return result.data;
}
