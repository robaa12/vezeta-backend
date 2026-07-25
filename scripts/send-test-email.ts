import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { Resend } from 'resend';

loadEnv();

type OtpType =
  'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

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
    'sign-in':
      'Use the code below to finish signing in to your Vezeeta account.',
    'email-verification':
      'Enter this code to verify your email and activate your Vezeeta account.',
    'forget-password':
      'Use this code to reset your Vezeeta password. If you did not request a reset, no changes will be made.',
    'change-email':
      'Use this code to confirm the new email address on your Vezeeta account.',
  }[t];

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background:#f2f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #dbe6e1;overflow:hidden;box-shadow:0 1px 3px 0 rgba(0,0,0,0.04);">
          <!-- Header -->
          <tr>
            <td style="padding:32px 36px 0 36px;text-align:center;">
              <div style="display:inline-block;width:40px;height:40px;background:#006b56;border-radius:12px;line-height:40px;font-size:22px;text-align:center;">
                &#x1F3E5;
              </div>
              <div style="margin-top:12px;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#6b7a74;">
                Vezeeta
              </div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 36px 36px 36px;">
              <div style="text-align:center;">
                <h1 style="margin:0 0 6px 0;font-size:18px;line-height:1.35;font-weight:600;color:#191c1e;">${heading}</h1>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#3b4a44;">${intro}</p>
              </div>

              <!-- OTP code -->
              <div style="margin:28px 0 12px 0;text-align:center;">
                <div role="button" tabindex="0" class="otp-pill" onclick="copyVezeetaOtp('${otp}', this); return false;" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();copyVezeetaOtp('${otp}', this);}" style="display:inline-block;position:relative;background:#f3f7f5;border:1px solid #dbe6e1;border-radius:12px;padding:16px 26px;cursor:pointer;">
                  <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:26px;font-weight:600;letter-spacing:0.22em;color:#1b2421;">
                    ${otp}
                  </div>
                  <div class="otp-feedback" aria-live="polite" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#006b56;background:#ffffff;border:1px solid #dbe6e1;border-radius:9999px;padding:4px 10px;opacity:0;pointer-events:none;">
                    Copied
                  </div>
                </div>
                <p style="margin:10px 0 0 0;font-size:12px;line-height:1.5;color:#6b7a74;">
                  Click the code to copy it
                </p>
              </div>

              <!-- Copy button -->
              <div style="text-align:center;">
                <a href="#" role="button" onclick="copyVezeetaOtp('${otp}', this); return false;" style="display:inline-block;background:#ffffff;border:1px solid #bacac3;border-radius:9999px;padding:8px 20px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:500;color:#006b56;text-decoration:none;cursor:pointer;">
                  Copy code
                </a>
              </div>

              <!-- Meta -->
              <div style="text-align:center;margin-top:26px;">
                <p style="margin:0 0 4px 0;font-size:13px;line-height:1.6;color:#3b4a44;">
                  This code expires in <strong style="color:#191c1e;">10 minutes</strong>.
                </p>
                <p style="margin:0;font-size:11px;line-height:1.6;color:#6b7a74;">
                  If you didn&#39;t request this, you can safely ignore this email.<br>
                  Never share this code. Vezeeta staff will never ask for it.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:0 36px 24px 36px;border-top:1px solid #dbe6e1;">
              <p style="margin:20px 0 0 0;font-size:11px;line-height:1.6;color:#6b7a74;text-align:center;">
                &copy; ${new Date().getFullYear()} Vezeeta. All rights reserved.
              </p>
              <p style="margin:4px 0 0 0;font-size:11px;line-height:1.6;color:#6b7a74;text-align:center;">
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
