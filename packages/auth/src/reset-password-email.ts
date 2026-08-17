export type ResetPasswordEmailParams = {
  name: string;
  url: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildResetPasswordEmail({
  name,
  url,
}: ResetPasswordEmailParams): { subject: string; html: string } {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(url);
  return {
    subject: "Reset your Cogito password",
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
                <h1 style="margin:0 0 8px 0;font-size:20px;line-height:28px;color:#111111;">Reset your password</h1>
                <p style="margin:0;font-size:14px;line-height:22px;color:#525252;">Hi ${safeName},</p>
                <p style="margin:12px 0 0 0;font-size:14px;line-height:22px;color:#525252;">
                  We received a request to reset the password for your Cogito account. Click the button below to choose a new password.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px;">
                <a href="${safeUrl}" style="display:inline-block;background-color:#111111;color:#ffffff;font-size:14px;font-weight:600;line-height:20px;padding:12px 24px;border-radius:8px;text-decoration:none;">Reset password</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;">
                <p style="margin:0;font-size:12px;line-height:18px;color:#737373;">
                  This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password won't change.
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