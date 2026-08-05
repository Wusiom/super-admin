import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { argon2id, hash as hashPassword } from 'argon2';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PasswordResetService {
  constructor(private readonly prisma: PrismaService) {}

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const precheckResult: unknown =
      await this.prisma.passwordResetToken.findUnique({
        where: { tokenHash },
      });
    const precheck = this.toResetToken(precheckResult);
    if (
      !precheck ||
      precheck.consumedAt ||
      precheck.revokedAt ||
      precheck.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    const hashResult: unknown = await hashPassword(password, {
      type: argon2id,
    });
    if (typeof hashResult !== 'string') throw new Error('Password hash failed');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const now = new Date();
      try {
        const redeemed = await this.prisma.$transaction(
          async (transaction) => {
            const tokenResult: unknown =
              await transaction.passwordResetToken.findUnique({
                where: { tokenHash },
              });
            const token = this.toResetToken(tokenResult);
            if (
              !token ||
              token.consumedAt ||
              token.revokedAt ||
              token.expiresAt <= now
            )
              return false;
            const consumed = await transaction.passwordResetToken.updateMany({
              where: {
                id: token.id,
                consumedAt: null,
                revokedAt: null,
                expiresAt: { gt: now },
              },
              data: { consumedAt: now },
            });
            if (consumed.count !== 1) return false;
            await transaction.user.update({
              where: { id: token.userId },
              data: { passwordHash: hashResult },
            });
            await transaction.webSession.updateMany({
              where: { userId: token.userId, revokedAt: null },
              data: { revokedAt: now },
            });
            return true;
          },
          { isolationLevel: 'Serializable' },
        );
        if (redeemed) return;
        throw new UnauthorizedException('Invalid or expired reset token');
      } catch (error: unknown) {
        if (!this.hasPrismaErrorCode(error, 'P2034')) throw error;
        if (attempt === 3)
          throw new ServiceUnavailableException(
            'Password reset temporarily unavailable',
          );
      }
    }
    throw new ServiceUnavailableException(
      'Password reset temporarily unavailable',
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

  private hasPrismaErrorCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }
}
