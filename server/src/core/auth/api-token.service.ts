import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ApiTokenService implements OnModuleInit {
  private readonly logger = new Logger(ApiTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const existing = await this.prisma.apiToken.findFirst();
    if (existing) {
      this.logger.log('ApiToken 已存在，不覆盖');
      return;
    }

    // 首次启动：自动生成 token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash = this.hashToken(rawToken);

    await this.prisma.apiToken.create({
      data: { token: hash, label: 'default' },
    });

    this.logger.warn('=' .repeat(60));
    this.logger.warn('🔑 首次启动，已自动生成 API Token（请妥善保存）：');
    this.logger.warn(rawToken);
    this.logger.warn('=' .repeat(60));
  }

  /** SHA-256 哈希 raw token，返回 hex 字符串 */
  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /** 验证 raw token 是否匹配数据库中任一有效 token */
  async validate(rawToken: string): Promise<boolean> {
    const hash = this.hashToken(rawToken);
    const token = await this.prisma.apiToken.findUnique({ where: { token: hash } });
    return token !== null;
  }

  /** 生成新 token，覆盖旧值。返回 raw token。 */
  async generateNewToken(): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash = this.hashToken(rawToken);

    // 使用 upsert：有则更新，无则创建
    const existing = await this.prisma.apiToken.findFirst();
    if (existing) {
      await this.prisma.apiToken.update({
        where: { id: existing.id },
        data: { token: hash },
      });
    } else {
      await this.prisma.apiToken.create({
        data: { token: hash, label: 'default' },
      });
    }

    this.logger.log('ApiToken 已刷新（旧 token 已失效）');
    return rawToken;
  }
}
