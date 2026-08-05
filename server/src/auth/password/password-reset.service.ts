import { Injectable, UnauthorizedException } from '@nestjs/common';
import { argon2id, hash as hashPassword } from 'argon2';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PasswordResetService {
  constructor(private readonly prisma: PrismaService) {}

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const now = new Date();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const result: unknown = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    const token = this.toResetToken(result);
    if (!token || token.consumedAt || token.revokedAt || token.expiresAt <= now)
      throw new UnauthorizedException('重置链接无效或已过期');
    const hashResult: unknown = await hashPassword(password, {
      type: argon2id,
    });
    if (typeof hashResult !== 'string') throw new Error('密码哈希失败');
    const passwordHash = hashResult;
    await this.prisma.$transaction(
      async (transaction) => {
        const consumed = await transaction.passwordResetToken.updateMany({
          where: {
            id: token.id,
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1)
          throw new UnauthorizedException('重置链接无效或已过期');
        await transaction.user.update({
          where: { id: token.userId },
          data: { passwordHash },
        });
        await transaction.webSession.updateMany({
          where: { userId: token.userId, revokedAt: null },
          data: { revokedAt: now },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private toResetToken(value: unknown): {
    id: number;
    userId: number;
    expiresAt: Date;
    consumedAt: Date | null;
    revokedAt: Date | null;
  } | null {
    if (
      !value ||
      typeof value !== 'object' ||
      !('id' in value) ||
      !('userId' in value) ||
      !('expiresAt' in value) ||
      !('consumedAt' in value) ||
      !('revokedAt' in value) ||
      typeof value.id !== 'number' ||
      typeof value.userId !== 'number' ||
      !(value.expiresAt instanceof Date) ||
      (value.consumedAt !== null && !(value.consumedAt instanceof Date)) ||
      (value.revokedAt !== null && !(value.revokedAt instanceof Date))
    ) {
      return null;
    }
    return {
      id: value.id,
      userId: value.userId,
      expiresAt: value.expiresAt,
      consumedAt: value.consumedAt,
      revokedAt: value.revokedAt,
    };
  }
}
