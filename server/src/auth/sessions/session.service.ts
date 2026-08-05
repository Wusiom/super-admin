import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from './auth-principal';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type SessionUser = { id: number; role: 'USER' | 'ADMIN' };
export type WebSessionTokens = { accessToken: string; refreshToken: string };

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async createSession(
    user: SessionUser,
    metadata: { userAgent?: string; ipAddressHash?: string } = {},
  ): Promise<WebSessionTokens> {
    const refreshToken = this.createToken();
    const session = await this.prisma.webSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        familyId: randomUUID(),
        expiresAt: this.expiresAt(),
        ...metadata,
      },
    });
    return {
      accessToken: await this.createAccessToken(user, session.id),
      refreshToken,
    };
  }

  async rotate(refreshToken: string): Promise<WebSessionTokens> {
    const tokenHash = this.hashToken(refreshToken);
    const now = new Date();
    return this.prisma.$transaction(
      async (transaction) => {
        const current = await transaction.webSession.findUnique({
          where: { tokenHash },
          include: { user: true },
        });
        if (!current) throw new UnauthorizedException('刷新令牌无效');
        if (
          current.revokedAt ||
          current.rotatedAt ||
          current.expiresAt <= now ||
          current.user.status !== 'ACTIVE'
        ) {
          await transaction.webSession.updateMany({
            where: {
              userId: current.userId,
              familyId: current.familyId,
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
          throw new UnauthorizedException('刷新令牌无效');
        }
        const consumed = await transaction.webSession.updateMany({
          where: {
            id: current.id,
            revokedAt: null,
            rotatedAt: null,
            expiresAt: { gt: now },
          },
          data: { rotatedAt: now, lastUsedAt: now },
        });
        if (consumed.count !== 1) {
          await transaction.webSession.updateMany({
            where: {
              userId: current.userId,
              familyId: current.familyId,
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
          throw new UnauthorizedException('刷新令牌无效');
        }
        const nextRefresh = this.createToken();
        const next = await transaction.webSession.create({
          data: {
            userId: current.userId,
            tokenHash: this.hashToken(nextRefresh),
            familyId: current.familyId,
            expiresAt: this.expiresAt(),
            userAgent: current.userAgent,
            ipAddressHash: current.ipAddressHash,
          },
        });
        return {
          accessToken: await this.createAccessToken(current.user, next.id),
          refreshToken: nextRefresh,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async logout(principal: AuthPrincipal): Promise<void> {
    await this.prisma.webSession.updateMany({
      where: {
        id: principal.sessionId,
        userId: principal.userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: number): Promise<void> {
    await this.prisma.webSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private createToken(): string {
    return randomBytes(32).toString('base64url');
  }
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  private expiresAt(): Date {
    return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  }
  private createAccessToken(
    user: SessionUser,
    sessionId: number,
  ): Promise<string> {
    return this.jwt.signAsync(
      { userId: user.id, role: user.role, sessionId, kind: 'web' },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL,
      },
    );
  }
}
