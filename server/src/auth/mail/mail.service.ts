import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly pendingDispatches = new Set<Promise<void>>();

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    private readonly config: ConfigService,
  ) {}

  async sendVerification(email: string, token: string): Promise<void> {
    await this.transport.send({
      to: email,
      subject: '验证你的邮箱',
      text: `请在链接失效前完成邮箱验证：${this.createLink(
        '/verify-email',
        token,
      )}`,
    });
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    await this.transport.send({
      to: email,
      subject: '重置你的密码',
      text: `请在链接失效前重置密码：${this.createLink(
        '/reset-password',
        token,
      )}`,
    });
  }

  dispatchVerification(email: string, token: string): void {
    this.dispatch('verification', () => this.sendVerification(email, token));
  }

  dispatchPasswordReset(email: string, token: string): void {
    this.dispatch('password_reset', () => this.sendPasswordReset(email, token));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.pendingDispatches);
  }

  private createLink(path: string, token: string): string {
    const publicUrl = this.config.getOrThrow<string>('APP_PUBLIC_URL');
    const url = new URL(path, publicUrl);
    return `${url.toString()}?token=${encodeURIComponent(token)}`;
  }

  private dispatch(kind: string, send: () => Promise<void>): void {
    const task = Promise.resolve()
      .then(send)
      .catch(() => {
        this.logger.error({
          event: 'mail_dispatch_failed',
          kind,
          errorCategory: 'transport_failure',
        });
      })
      .finally(() => {
        this.pendingDispatches.delete(task);
      });
    this.pendingDispatches.add(task);
  }
}
