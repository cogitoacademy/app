/**
 * Distinguishes hosted redirect checkout from inline EMVCo QR payload.
 * QR payloads are EMVCo data and never start with http(s); redirect
 * checkouts are always absolute http(s) URLs.
 */
export function isRedirectCheckoutUrl(checkoutUrl: string): boolean {
  return /^https?:\/\//i.test(checkoutUrl.trim());
}
