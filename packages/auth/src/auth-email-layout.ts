// Email-safe sRGB orange and companion blue from the approved report banner.
const blue = "#08749b";
const orange = "#ff6801";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailLink(url: string, label: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Auth email links must use HTTP or HTTPS");
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${orange}" style="border-radius:8px;background-color:${orange};"><a href="${escapeHtml(url)}" style="display:inline-block;border:1px solid ${orange};border-radius:8px;padding:13px 22px;color:#262626;font-size:14px;line-height:20px;font-weight:700;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

// Only trusted template markup belongs in content; escape all interpolated user data.
export type AuthEmailBranding = { headerUrl?: string };

export function authEmailLayout(content: string, headerUrl?: string): string {
  if (headerUrl) {
    const parsed = new URL(headerUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Auth email header must use HTTP or HTTPS");
    }
  }
  const header = headerUrl
    ? `<img src="${escapeHtml(headerUrl)}" alt="Cogito Academy" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;color:${blue};font-size:20px;font-weight:700;">`
    : `<p style="margin:0;padding:24px;font-size:23px;line-height:28px;font-weight:700;color:${blue};">Cogito Academy</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Cogito Academy</title></head>
<body style="margin:0;padding:0;background-color:#f6f6f6;color:#262626;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6f6;"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;table-layout:fixed;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
<tr><td>${header}</td></tr>
<tr><td style="padding:28px 24px;overflow-wrap:anywhere;word-wrap:break-word;font-size:14px;line-height:23px;">${content}</td></tr>
<tr><td style="padding:20px 24px;border-top:1px solid #e5e5e5;"><p style="margin:0;font-size:12px;line-height:18px;font-weight:700;color:${blue};">Cogito Academy</p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

export const emailHeadingStyle =
  "margin:0 0 16px;font-size:24px;line-height:32px;letter-spacing:-0.5px;color:#262626;";
export const emailNoteStyle =
  "margin:24px 0 0;font-size:12px;line-height:19px;color:#737373;";
