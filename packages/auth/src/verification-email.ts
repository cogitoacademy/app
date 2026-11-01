import type { AuthEmailBranding } from "./auth-email-layout";
import {
  authEmailLayout,
  emailHeadingStyle,
  emailLink,
  emailNoteStyle,
  escapeHtml,
} from "./auth-email-layout";

export type VerificationEmailParams = AuthEmailBranding & {
  name: string;
  otp: string;
  expiresInMinutes: number;
};

export type SignupWelcomeEmailParams = AuthEmailBranding & {
  name: string;
  loginUrl: string;
};

export function buildVerificationEmail({
  name,
  headerUrl,
  otp,
  expiresInMinutes,
}: VerificationEmailParams): { subject: string; html: string } {
  return {
    subject: "Verify your Cogito Academy email",
    html: authEmailLayout(
      `
<h1 style="${emailHeadingStyle}">Verify your Cogito Academy email</h1>
<p style="margin:0;color:#525252;">Hi ${escapeHtml(name)},</p>
<p style="margin:12px 0 24px;color:#525252;">Use the code below to verify your Cogito Academy account email. It expires in ${expiresInMinutes} minutes.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 8px;background-color:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;"><p style="margin:0 0 8px;font-size:11px;line-height:16px;color:#525252;">VERIFICATION CODE</p><p style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:28px;line-height:36px;font-weight:700;letter-spacing:5px;color:#262626;">${escapeHtml(otp)}</p></td></tr></table>
<p style="${emailNoteStyle}">If you didn't create a Cogito Academy account, you can safely ignore this email.</p>`,
      headerUrl,
    ),
  };
}

export function buildSignupWelcomeEmail({
  name,
  headerUrl,
  loginUrl,
}: SignupWelcomeEmailParams): { subject: string; html: string } {
  return {
    subject: "Welcome to Cogito Academy",
    html: authEmailLayout(
      `
<h1 style="${emailHeadingStyle}">Welcome to Cogito Academy, ${escapeHtml(name)}!</h1>
<p style="margin:0 0 24px;color:#525252;">Your email is verified. Browse tutors, manage your Marks, and book your first session.</p>
${emailLink(loginUrl, "Go to Cogito Academy")}`,
      headerUrl,
    ),
  };
}
