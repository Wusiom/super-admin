import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ApiTokenService implements OnModuleInit {
  private readonly logger = new Logger(ApiTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // Token 必须由已认证用户显式创建，应用启动不得制造无主凭据。
  }

  /** SHA-256 哈希 raw token，返回 hex 字符串 */
  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /** 验证 raw token，并返回只能由服务端建立的所有者上下文。 */
  async validate(rawToken: string): Promise<ApiTokenPrincipal | null> {
    const hash = this.hashToken(rawToken);
    const token = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hash },
    });
    if (
      !token ||
      token.revokedAt ||
      (token.expiresAt && token.expiresAt <= new Date())
    ) {
      return null;
    }

    await this.prisma.apiToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    });
    return { userId: token.userId, scopes: token.scopes };
  }

  /** 为已认证用户生成扩展 Token，仅返回一次原文。 */
  async generateNewToken(userId: number): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash = this.hashToken(rawToken);

    await this.prisma.apiToken.create({
      data: {
        userId,
        tokenHash: hash,
        label: 'extension',
        scopes: ['capture:create'],
      },
    });

    this.logger.log(`用户 ${userId} 已创建扩展 API Token`);
    return rawToken;
  }
}

export interface ApiTokenPrincipal {
  userId: number;
  scopes: string[];
}
