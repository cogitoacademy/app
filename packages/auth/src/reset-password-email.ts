import type { AuthEmailBranding } from "./auth-email-layout";
import {
  authEmailLayout,
  emailHeadingStyle,
  emailLink,
  emailNoteStyle,
  escapeHtml,
} from "./auth-email-layout";

export type ResetPasswordEmailParams = AuthEmailBranding & {
  name: string;
  url: string;
};

export function buildResetPasswordEmail({
  name,
  headerUrl,
  url,
}: ResetPasswordEmailParams): { subject: string; html: string } {
  return {
    subject: "Reset your Cogito Academy password",
    html: authEmailLayout(
      `
<h1 style="${emailHeadingStyle}">Reset your Cogito Academy password</h1>
<p style="margin:0;color:#525252;">Hi ${escapeHtml(name)},</p>
<p style="margin:12px 0 24px;color:#525252;">We received a request to reset the password for your Cogito Academy account. Click the button below to choose a new password.</p>
${emailLink(url, "Reset Cogito Academy password")}
<p style="${emailNoteStyle}">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>`,
      headerUrl,
    ),
  };
}
