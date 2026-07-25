import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
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
  private readonly provider: 'resend' | 'smtp';
  private readonly resend: Resend | null;
  private readonly transport: Transporter | null;
  private readonly fromAddress: string;
  private readonly isProduction: boolean;
  private readonly verifyUrl: string;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.provider = (process.env.MAIL_PROVIDER ?? 'resend') as
      'resend' | 'smtp';
    this.fromAddress =
      process.env.EMAIL_FROM ?? 'Vezeeta <onboarding@resend.dev>';
    this.verifyUrl = process.env.VEZEETA_VERIFY_URL ?? '';

    if (this.provider === 'smtp') {
      this.resend = null;
      this.transport = createTransport({
        host: process.env.SMTP_HOST ?? 'localhost',
        port: Number(process.env.SMTP_PORT ?? 1025),
        secure: process.env.SMTP_SECURE === 'true',
      });
      this.logger.log(
        `Using SMTP provider via ${process.env.SMTP_HOST ?? 'localhost'}:${process.env.SMTP_PORT ?? 1025}`,
      );
    } else {
      this.transport = null;
      const apiKey = process.env.RESEND_API_KEY;
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
  }

  async sendOtp({ email, otp, type }: SendEmailOtpInput): Promise<void> {
    const subject = this.subjectFor(type);
    const html = this.renderOtpTemplate({ otp, type });
    await this.send({ to: email, subject, html, tag: `otp:${type}` });
  }

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
    if (this.provider === 'smtp' && this.transport) {
      await this.sendViaSmtp(params);
      return;
    }

    if (this.provider === 'resend') {
      if (!this.resend) {
        this.logger.log(
          `[email:${params.tag}:dev] to=${params.to} subject="${params.subject}"`,
        );
        return;
      }
      await this.sendViaResend(params);
      return;
    }

    this.logger.log(
      `[email:${params.tag}:dev] to=${params.to} subject="${params.subject}"`,
    );
  }

  private async sendViaSmtp(params: {
    to: string;
    subject: string;
    html: string;
    tag: string;
  }): Promise<void> {
    await this.transport!.sendMail({
      from: this.fromAddress,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    this.logger.log(
      `[email:${params.tag}:smtp] to=${params.to} subject="${params.subject}"`,
    );
  }

  private async sendViaResend(params: {
    to: string;
    subject: string;
    html: string;
    tag: string;
  }): Promise<void> {
    try {
      const { data, error } = await this.resend!.emails.send({
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

  // ─── Shared layout wrapper ────────────────────────────────────────────────

  private renderLayout(title: string, body: string): string {
    const yr = new Date().getFullYear();
    return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background:#f2f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f6;padding:48px 16px;">
    <tr>
      <td align="center">
        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;border:1px solid #bacac3;overflow:hidden;box-shadow:0 1px 4px 0 rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="padding:44px 40px 0 40px;text-align:center;">
              <div style="display:inline-block;width:52px;height:52px;background:linear-gradient(135deg,#006b56,#00594a);border-radius:16px;line-height:52px;font-size:26px;text-align:center;box-shadow:0 8px 20px rgba(0,107,86,0.22);">
                &#x1F3E5;
              </div>
              <div style="margin-top:16px;font-size:13px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#6b7a74;">
                Vezeeta
              </div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:34px 40px 42px 40px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:0 40px 28px 40px;border-top:1px solid #bacac3;">
              <p style="margin:24px 0 0 0;font-size:12px;line-height:1.6;color:#6b7a74;text-align:center;">
                &copy; ${yr} Vezeeta. All rights reserved.
              </p>
              <p style="margin:6px 0 0 0;font-size:12px;line-height:1.6;color:#6b7a74;text-align:center;">
                You received this email because you have a Vezeeta account.<br>
                If you have questions, contact our support team.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <script>
    (function(){
      window.copyVezeetaOtp = function(code, el) {
        function showFeedback(target) {
          var fb = target.querySelector('.otp-feedback');
          if (fb) {
            fb.style.opacity = '1';
            setTimeout(function(){ fb.style.opacity = '0'; }, 1500);
            return;
          }
          if (target.tagName === 'A' || target.tagName === 'BUTTON') {
            var original = target.innerText;
            target.innerText = 'Copied';
            setTimeout(function(){ target.innerText = original; }, 1500);
          }
        }
        function selectText() {
          var selection = window.getSelection();
          var range = document.createRange();
          range.selectNodeContents(el);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(function(){ showFeedback(el); }).catch(selectText);
        } else {
          selectText();
        }
        return false;
      };
    })();
  </script>
</body>
</html>`;
  }

  // ─── OTP template ─────────────────────────────────────────────────────────

  private renderOtpTemplate({
    otp,
    type,
  }: Pick<SendEmailOtpInput, 'otp' | 'type'>): string {
    const heading = this.headingFor(type);
    const intro = this.introFor(type);
    const verifyHref = this.verifyUrl
      ? `${this.verifyUrl}?code=${encodeURIComponent(otp)}`
      : '';

    const body = `
      <div style="text-align:center;">
        <h1 style="margin:0 0 10px 0;font-size:22px;line-height:1.3;font-weight:700;color:#191c1e;">${heading}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#3b4a44;">${intro}</p>
      </div>

      <!-- OTP hero pill -->
      <div style="margin:36px 0 18px 0;text-align:center;">
        <div role="button" tabindex="0" class="otp-pill" onclick="copyVezeetaOtp('${otp}', this); return false;" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();copyVezeetaOtp('${otp}', this);}" style="display:inline-block;position:relative;background:linear-gradient(135deg,#c9fff0 0%,#ffffff 100%);border:1px solid #bacac3;border-radius:9999px;padding:22px 38px;cursor:pointer;box-shadow:0 0 0 1px rgba(0,107,86,0.06),0 10px 28px rgba(0,107,86,0.10);">
          <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:0.32em;color:#191c1e;text-shadow:0 1px 0 rgba(255,255,255,0.6);">
            ${otp}
          </div>
          <div class="otp-feedback" aria-live="polite" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#006b56;background:#ffffff;border:1px solid #bacac3;border-radius:9999px;padding:6px 14px;opacity:0;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
            Copied
          </div>
        </div>
        <p style="margin:14px 0 0 0;font-size:12px;line-height:1.5;color:#6b7a74;">
          Click the code to copy it
        </p>
      </div>

      <!-- Copy button -->
      <div style="text-align:center;">
        <a href="#" role="button" onclick="copyVezeetaOtp('${otp}', this); return false;" style="display:inline-block;background:#006b56;border:1px solid #006b56;border-radius:9999px;padding:12px 28px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,107,86,0.25);">
          Copy code
        </a>
      </div>

      <!-- Meta -->
      <div style="text-align:center;margin-top:28px;">
        <p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:#3b4a44;">
          This code expires in <strong style="color:#191c1e;">10 minutes</strong>.
        </p>
        ${verifyHref ? `
        <p style="margin:0 0 16px 0;font-size:13px;line-height:1.5;color:#6b7a74;">
          <a href="${verifyHref}" style="color:#006b56;text-decoration:underline;font-weight:600;">Verify automatically</a>
        </p>
        ` : ''}
        <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7a74;">
          If you didn&#39;t request this, you can safely ignore this email.<br>
          Never share this code. Vezeeta staff will never ask for it.
        </p>
      </div>`;

    return this.renderLayout(heading, body);
  }

  // ─── Notification template ────────────────────────────────────────────────

  private renderNotificationTemplate(params: {
    subject: string;
    body: string;
  }): string {
    const safe = params.body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\\n\\n/g, '<br><br>')
      .replace(/\\n/g, '<br>');

    const body = `
      <div style="text-align:center;">
        <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;font-weight:700;color:#191c1e;">${params.subject}</h1>
      </div>
      <div style="background:#f2f4f6;border-radius:10px;border:1px solid #bacac3;padding:20px 24px;margin-bottom:8px;">
        <p style="margin:0;font-size:14px;line-height:1.65;color:#3b4a44;word-break:break-word;">${safe}</p>
      </div>
      <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#6b7a74;text-align:center;">
        This is an automated notification from your Vezeeta account.
      </p>`;

    return this.renderLayout(params.subject, body);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

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
        return 'Use this code to reset your Vezeeta password. If you didn\u2019t request a reset, no changes will be made.';
      case 'change-email':
        return 'Use this code to confirm the new email address on your Vezeeta account.';
    }
  }
}
