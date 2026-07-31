import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  argon2id,
  hash as hashPassword,
  verify as verifyPassword,
} from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const VERIFICATION_RESEND_INTERVAL_MS = 60 * 1000;
const PASSWORD_RESET_REQUEST_INTERVAL_MS = 60 * 1000;
const SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS = 3;
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$RpjWxpSqVcFZRZ9lypF1sQ$4LXCClwCPSHZ5taeZbSCFuVInt07Ocr8ni1EkiTYZFk';

const REGISTRATION_RESPONSE = {
  message: '注册成功，请检查邮箱完成验证。',
};
const VERIFICATION_RESPONSE = {
  message: '邮箱验证成功。',
};
const VERIFICATION_RESEND_RESPONSE = {
  message: '如果该账户可以接收验证邮件，新的验证链接将发送到邮箱。',
};
const PASSWORD_RECOVERY_RESPONSE = {
  message: '如果该邮箱对应可用账户，密码重置链接将发送到邮箱。',
};

export type AccountPrincipal = {
  id: number;
  email: string;
  role: 'USER' | 'ADMIN';
};

type PublicMessage = {
  message: string;
};

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<PublicMessage> {
    const email = dto.email.trim();
    const emailNormalized = this.normalizeEmail(email);
    const existingUser = await this.prisma.user.findUnique({
      where: { emailNormalized },
    });
    if (existingUser) {
      throw new ConflictException('该邮箱不可用于注册');
    }

    const passwordHash = await this.createPasswordHash(dto.password);
    const rawToken = this.createRawToken();
    const now = new Date();

    let user: { email: string };
    try {
      user = await this.prisma.$transaction(
        async (transaction: Prisma.TransactionClient) => {
          const createdUser = await transaction.user.create({
            data: {
              email,
              emailNormalized,
              passwordHash,
            },
          });
          await transaction.emailToken.create({
            data: {
              userId: createdUser.id,
              tokenHash: this.hashToken(rawToken),
              expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
            },
          });
          return createdUser;
        },
      );
    } catch (error: unknown) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException('该邮箱不可用于注册');
      }
      throw error;
    }

    this.mail.dispatchVerification(user.email, rawToken);
    return { ...REGISTRATION_RESPONSE };
  }

  async authenticate(
    email: string,
    password: string,
  ): Promise<AccountPrincipal> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(email) },
    });
    const passwordMatches = await verifyPassword(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      password,
    );

    if (
      !user ||
      !passwordMatches ||
      !user.emailVerifiedAt ||
      user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('邮箱或密码无效');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  async verifyEmail(rawToken: string): Promise<PublicMessage> {
    const token = await this.prisma.emailToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      include: { user: true },
    });
    const now = new Date();

    if (
      !token ||
      token.consumedAt ||
      token.revokedAt ||
      token.expiresAt <= now ||
      token.user.emailVerifiedAt
    ) {
      throw new UnauthorizedException('验证链接无效或已过期');
    }

    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.emailToken.updateMany({
        where: {
          id: token.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('验证链接无效或已过期');
      }
      await transaction.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: now },
      });
    });

    return { ...VERIFICATION_RESPONSE };
  }

  resendVerification(email: string): Promise<PublicMessage> {
    const emailNormalized = this.normalizeEmail(email);
    this.mail.dispatchVerificationTask(async () => {
      const user = await this.prisma.user.findUnique({
        where: { emailNormalized },
      });
      if (!user || user.emailVerifiedAt || user.status !== 'ACTIVE') {
        return null;
      }

      const now = new Date();
      const rawToken = this.createRawToken();
      const issued = await this.issueVerificationToken(
        user.id,
        this.hashToken(rawToken),
        now,
      );
      return issued ? { email: user.email, token: rawToken } : null;
    });
    return Promise.resolve({ ...VERIFICATION_RESEND_RESPONSE });
  }

  requestPasswordReset(email: string): Promise<PublicMessage> {
    const emailNormalized = this.normalizeEmail(email);
    this.mail.dispatchPasswordResetTask(async () => {
      const user = await this.prisma.user.findUnique({
        where: { emailNormalized },
      });
      if (!user || !user.emailVerifiedAt || user.status !== 'ACTIVE') {
        return null;
      }

      const rawToken = this.createRawToken();
      const now = new Date();
      const issued = await this.issuePasswordResetToken(
        user.id,
        this.hashToken(rawToken),
        now,
      );
      return issued ? { email: user.email, token: rawToken } : null;
    });
    return Promise.resolve({ ...PASSWORD_RECOVERY_RESPONSE });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private createRawToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private async createPasswordHash(password: string): Promise<string> {
    const result: unknown = await hashPassword(password, { type: argon2id });
    if (typeof result !== 'string') {
      throw new Error('密码哈希失败');
    }
    return result;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueVerificationToken(
    userId: number,
    tokenHash: string,
    now: Date,
  ): Promise<boolean> {
    for (
      let attempt = 1;
      attempt <= SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(
          async (transaction: Prisma.TransactionClient) => {
            const user = await transaction.user.findUnique({
              where: { id: userId },
            });
            if (!user || user.emailVerifiedAt || user.status !== 'ACTIVE') {
              return false;
            }

            const latestToken = await transaction.emailToken.findFirst({
              where: {
                userId,
                consumedAt: null,
                revokedAt: null,
              },
              orderBy: { createdAt: 'desc' },
            });
            if (
              latestToken &&
              latestToken.createdAt >
                new Date(now.getTime() - VERIFICATION_RESEND_INTERVAL_MS)
            ) {
              return false;
            }

            await transaction.emailToken.updateMany({
              where: {
                userId,
                consumedAt: null,
                revokedAt: null,
              },
              data: { revokedAt: now },
            });
            await transaction.emailToken.create({
              data: {
                userId,
                tokenHash,
                expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
              },
            });
            return true;
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error: unknown) {
        if (!this.hasPrismaErrorCode(error, 'P2034')) {
          throw error;
        }
        if (attempt === SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS) {
          return false;
        }
      }
    }

    return false;
  }

  private async issuePasswordResetToken(
    userId: number,
    tokenHash: string,
    now: Date,
  ): Promise<boolean> {
    for (
      let attempt = 1;
      attempt <= SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(
          async (transaction: Prisma.TransactionClient) => {
            const user = await transaction.user.findUnique({
              where: { id: userId },
            });
            if (!user || !user.emailVerifiedAt || user.status !== 'ACTIVE') {
              return false;
            }

            const latestToken = await transaction.passwordResetToken.findFirst({
              where: {
                userId,
                consumedAt: null,
                revokedAt: null,
              },
              orderBy: { createdAt: 'desc' },
            });
            if (
              latestToken &&
              latestToken.createdAt >
                new Date(now.getTime() - PASSWORD_RESET_REQUEST_INTERVAL_MS)
            ) {
              return false;
            }

            await transaction.passwordResetToken.updateMany({
              where: {
                userId,
                consumedAt: null,
                revokedAt: null,
              },
              data: { revokedAt: now },
            });
            await transaction.passwordResetToken.create({
              data: {
                userId,
                tokenHash,
                expiresAt: new Date(
                  now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS,
                ),
              },
            });
            return true;
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error: unknown) {
        if (!this.hasPrismaErrorCode(error, 'P2034')) {
          throw error;
        }
        if (attempt === SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS) {
          return false;
        }
      }
    }

    return false;
  }

  private isUniqueConstraint(error: unknown): boolean {
    return this.hasPrismaErrorCode(error, 'P2002');
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
