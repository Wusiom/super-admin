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
const SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS = 3;

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

    await this.mail.sendVerification(user.email, rawToken);
    return { ...REGISTRATION_RESPONSE };
  }

  async authenticate(
    email: string,
    password: string,
  ): Promise<AccountPrincipal> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(email) },
    });
    const passwordMatches = user
      ? await verifyPassword(user.passwordHash, password)
      : false;

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

  async resendVerification(email: string): Promise<PublicMessage> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(email) },
    });
    if (!user || user.emailVerifiedAt || user.status !== 'ACTIVE') {
      return { ...VERIFICATION_RESEND_RESPONSE };
    }

    const now = new Date();
    const rawToken = this.createRawToken();
    const issued = await this.issueVerificationToken(
      user.id,
      this.hashToken(rawToken),
      now,
    );
    if (issued) {
      await this.sendWithoutExposingFailure(() =>
        this.mail.sendVerification(user.email, rawToken),
      );
    }

    return { ...VERIFICATION_RESEND_RESPONSE };
  }

  async requestPasswordReset(email: string): Promise<PublicMessage> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(email) },
    });
    if (!user || !user.emailVerifiedAt || user.status !== 'ACTIVE') {
      return { ...PASSWORD_RECOVERY_RESPONSE };
    }

    const rawToken = this.createRawToken();
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(rawToken),
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
        },
      });
    });
    await this.sendWithoutExposingFailure(() =>
      this.mail.sendPasswordReset(user.email, rawToken),
    );

    return { ...PASSWORD_RECOVERY_RESPONSE };
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

  private async sendWithoutExposingFailure(
    send: () => Promise<void>,
  ): Promise<void> {
    try {
      await send();
    } catch {
      // 公开响应必须与未知邮箱一致；邮件传输自身负责安全诊断。
    }
  }
}
