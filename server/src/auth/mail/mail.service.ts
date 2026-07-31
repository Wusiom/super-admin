import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type MailTaskPayload = {
  email: string;
  token: string;
};

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

@Injectable()
export class MailService implements OnApplicationShutdown {
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

  dispatchVerificationTask(work: () => Promise<MailTaskPayload | null>): void {
    this.dispatchTask('verification', work, (payload) =>
      this.sendVerification(payload.email, payload.token),
    );
  }

  dispatchPasswordResetTask(work: () => Promise<MailTaskPayload | null>): void {
    this.dispatchTask('password_reset', work, (payload) =>
      this.sendPasswordReset(payload.email, payload.token),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    const timeoutMs = this.config.get<number>('MAIL_DRAIN_TIMEOUT_MS') ?? 8_000;
    const deadline = Date.now() + timeoutMs;
    while (this.pendingDispatches.size > 0) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled([...this.pendingDispatches]),
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, remainingMs);
        }),
      ]);
      if (timeout) {
        clearTimeout(timeout);
      }
    }
    if (this.pendingDispatches.size > 0) {
      this.logger.warn({
        event: 'mail_drain_timeout',
        pendingCount: this.pendingDispatches.size,
      });
    }
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
        this.logDispatchFailure(kind, 'transport_failure');
      })
      .finally(() => {
        this.pendingDispatches.delete(task);
      });
    this.pendingDispatches.add(task);
  }

  private dispatchTask(
    kind: string,
    work: () => Promise<MailTaskPayload | null>,
    send: (payload: MailTaskPayload) => Promise<void>,
  ): void {
    const task = Promise.resolve()
      .then(async () => {
        let payload: MailTaskPayload | null;
        try {
          payload = await work();
        } catch {
          this.logDispatchFailure(kind, 'token_issue_failure');
          return;
        }
        if (!payload) {
          return;
        }
        try {
          await send(payload);
        } catch {
          this.logDispatchFailure(kind, 'transport_failure');
        }
      })
      .finally(() => {
        this.pendingDispatches.delete(task);
      });
    this.pendingDispatches.add(task);
  }

  private logDispatchFailure(kind: string, errorCategory: string): void {
    this.logger.error({
      event: 'mail_dispatch_failed',
      kind,
      errorCategory,
    });
  }
}
