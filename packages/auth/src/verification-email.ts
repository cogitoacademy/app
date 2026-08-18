export type VerificationEmailParams = {
  name: string;
  otp: string;
  expiresInMinutes: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildVerificationEmail({
  name,
  otp,
  expiresInMinutes,
}: VerificationEmailParams): { subject: string; html: string } {
  const safeName = escapeHtml(name);
  const safeOtp = escapeHtml(otp);
  return {
    subject: "Verify your Cogito email",
    html: `
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f6f6f6;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <h1 style="margin:0 0 8px 0;font-size:20px;line-height:28px;color:#111111;">Verify your email</h1>
                <p style="margin:0;font-size:14px;line-height:22px;color:#525252;">Hi ${safeName},</p>
                <p style="margin:12px 0 0 0;font-size:14px;line-height:22px;color:#525252;">
                  Use the code below to verify your Cogito account email. It expires in ${expiresInMinutes} minutes.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px;">
                <div style="display:inline-block;background-color:#f3f4f6;border:1px solid #e5e5e5;border-radius:8px;padding:16px 32px;font-size:28px;font-weight:700;letter-spacing:8px;color:#111111;">${safeOtp}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;">
                <p style="margin:0;font-size:12px;line-height:18px;color:#737373;">
                  If you didn't create a Cogito account, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`,
  };
}
