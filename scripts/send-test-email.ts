import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { Resend } from 'resend';

loadEnv();

type OtpType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

const RESERVED_TEST_INBOXES = new Set([
  'delivered@resend.dev',
  'bounced@resend.dev',
  'complained@resend.dev',
]);

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM ?? 'Vezeeta <onboarding@resend.dev>';
const defaultInbox = process.env.RESEND_TEST_INBOX ?? 'delivered@resend.dev';

const to = (process.argv[2] ?? defaultInbox).trim();
const type = (process.argv[3] ?? 'sign-in') as OtpType;

if (!apiKey) {
  console.error(
    'RESEND_API_KEY is not set. Copy .env.example to .env and fill it in.',
  );
  process.exit(1);
}

if (!RESERVED_TEST_INBOXES.has(to) && !to.endsWith('@resend.dev')) {
  console.warn(
    `[test:email] ${to} is not a reserved Resend test mailbox. If you have not verified a sending domain on Resend, this send will fail with a 403.`,
  );
}

const otp = String(Math.floor(100000 + Math.random() * 900000));
const subject = subjectFor(type);
const html = renderTemplate({ otp, type });

const resend = new Resend(apiKey);

console.log(`[test:email] sending ${type} OTP to ${to} via ${fromAddress}`);

const { data, error } = await resend.emails.send({
  from: fromAddress,
  to,
  subject,
  html,
});

if (error) {
  console.error(`[test:email] Resend rejected the send:`);
  console.error(`  name:    ${error.name}`);
  console.error(`  message: ${error.message}`);
  process.exit(1);
}

console.log(`[test:email] accepted by Resend.`);
console.log(`  message id: ${data?.id ?? 'unknown'}`);
console.log(`  otp:        ${otp}   (also visible in the rendered email body)`);
console.log(`  inspect:    https://resend.com/emails/${data?.id ?? ''}`);

function subjectFor(t: OtpType): string {
  switch (t) {
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

function renderTemplate({
  otp,
  type: t,
}: {
  otp: string;
  type: OtpType;
}): string {
  const heading = {
    'sign-in': 'Your sign-in code',
    'email-verification': 'Verify your email',
    'forget-password': 'Reset your password',
    'change-email': 'Confirm your new email',
  }[t];

  const intro = {
    'sign-in': 'Use the code below to finish signing in to your Vezeeta account.',
    'email-verification': 'Enter this code to verify your email and activate your Vezeeta account.',
    'forget-password':
      'Use this code to reset your Vezeeta password. If you did not request a reset, no changes will be made.',
    'change-email': 'Use this code to confirm the new email address on your Vezeeta account.',
  }[t];

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
