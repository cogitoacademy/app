/**
 * Distinguishes a hosted redirect checkout (Midtrans Snap `redirect_url`,
 * Xendit e-wallet redirect) from an inline QR payload (Xendit QRIS).
 * QR payloads are EMVCo data and never start with http(s); redirect
 * checkouts are always absolute http(s) URLs.
 */
export function isRedirectCheckoutUrl(checkoutUrl: string): boolean {
  return /^https?:\/\//i.test(checkoutUrl.trim());
}
