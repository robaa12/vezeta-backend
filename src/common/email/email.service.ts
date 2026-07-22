import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export type EmailOtpType =
  'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

export interface SendEmailOtpInput {
  email: string;
  otp: string;
  type: EmailOtpType;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromAddress: string;
  private readonly isProduction: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    const apiKey = process.env.RESEND_API_KEY;
    this.fromAddress =
      process.env.EMAIL_FROM ?? 'Vezeeta <onboarding@resend.dev>';

    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.resend = null;
      if (this.isProduction) {
        this.logger.warn(
          'RESEND_API_KEY is not set — email delivery will be skipped in production.',
        );
      }
    }
  }

  async sendOtp({ email, otp, type }: SendEmailOtpInput): Promise<void> {
    const subject = this.subjectFor(type);
    const html = this.renderOtpTemplate({ otp, type });
    await this.send({ to: email, subject, html, tag: `otp:${type}` });
  }

  /**
   * Generic notification email used by the Notifications module.
   * `tag` is a short label included in dev logs and used to categorise
   * failures. Returns true on success, false on failure (caller may
   * mark the Notification row as FAILED — the dispatch is best-effort
   * and never throws to the inbound HTTP path).
   */
  async sendNotification(params: {
    to: string;
    subject: string;
    body: string;
    tag?: string;
  }): Promise<boolean> {
    const html = this.renderNotificationTemplate({
      subject: params.subject,
      body: params.body,
    });
    try {
      await this.send({
        to: params.to,
        subject: params.subject,
        html,
        tag: params.tag ?? 'notification',
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `notification email to ${params.to} failed (${params.tag ?? 'notification'}): ${message}`,
      );
      return false;
    }
  }

  private async send(params: {
    to: string;
    subject: string;
    html: string;
    tag: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.log(
        `[email:${params.tag}:dev] to=${params.to} subject="${params.subject}"`,
      );
      return;
    }
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      if (error) {
        this.logger.error(
          `Resend rejected email to ${params.to}: ${error.name} — ${error.message}`,
        );
        throw new Error(`res_send_failed: ${error.message}`);
      }
      this.logger.log(
        `email sent to ${params.to} (tag=${params.tag}, id=${data?.id ?? 'unknown'})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email to ${params.to}: ${message}`);
      throw err;
    }
  }

  private renderNotificationTemplate(params: {
    subject: string;
    body: string;
  }): string {
    return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;text-align:center;">
                <div style="font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#0f172a;">Vezeeta</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;color:#0f172a;">${params.subject}</h1>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.55;color:#475569;white-space:pre-line;">${params.body}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px 32px;border-top:1px solid #e2e8f0;margin-top:24px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">
                  &copy; ${new Date().getFullYear()} Vezeeta. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private subjectFor(type: EmailOtpType): string {
    switch (type) {
      case 'sign-in':
        return 'Your Vezeeta sign-in code';
      case 'email-verification':
        return 'Verify your Vezeeta email';
      case 'forget-password':
        return 'Reset your Vezeeta password';
      case 'change-email':
        return 'Confirm your new email address';
    }
  }

  private renderOtpTemplate({
    otp,
    type,
  }: Pick<SendEmailOtpInput, 'otp' | 'type'>): string {
    const heading = this.headingFor(type);
    const intro = this.introFor(type);

    return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;text-align:center;">
                <div style="font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#0f172a;">Vezeeta</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;color:#0f172a;">${heading}</h1>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.55;color:#475569;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 32px 8px 32px;">
                <div style="display:inline-block;background:#0f172a;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:0.4em;padding:16px 28px;border-radius:10px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">
                  ${otp}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <p style="margin:0 0 8px 0;font-size:14px;line-height:1.55;color:#475569;">
                  This code expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore the email.
                </p>
                <p style="margin:16px 0 0 0;font-size:13px;line-height:1.5;color:#94a3b8;">
                  For your security, never share this code with anyone. Vezeeta staff will never ask for it.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px 32px;border-top:1px solid #e2e8f0;margin-top:24px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">
                  &copy; ${new Date().getFullYear()} Vezeeta. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private headingFor(type: EmailOtpType): string {
    switch (type) {
      case 'sign-in':
        return 'Your sign-in code';
      case 'email-verification':
        return 'Verify your email';
      case 'forget-password':
        return 'Reset your password';
      case 'change-email':
        return 'Confirm your new email';
    }
  }

  private introFor(type: EmailOtpType): string {
    switch (type) {
      case 'sign-in':
        return 'Use the code below to finish signing in to your Vezeeta account.';
      case 'email-verification':
        return 'Enter this code to verify your email and activate your Vezeeta account.';
      case 'forget-password':
        return 'Use this code to reset your Vezeeta password. If you didn’t request a reset, no changes will be made.';
      case 'change-email':
        return 'Use this code to confirm the new email address on your Vezeeta account.';
    }
  }
}
