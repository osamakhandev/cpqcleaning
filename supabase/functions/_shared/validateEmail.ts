// Shared email validation: malformed, disposable, MX/A/AAAA deliverability.
import { DISPOSABLE_DOMAINS } from "./disposable-domains.ts";

export type EmailValidationResult =
  | { ok: true; email: string }
  | { ok: false; reason: "malformed" | "disposable" | "no_mx" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function validateEmail(rawEmail: string): Promise<EmailValidationResult> {
  const email = (rawEmail ?? "").trim().toLowerCase();
  if (!email || email.length > 255 || !EMAIL_RE.test(email)) {
    return { ok: false, reason: "malformed" };
  }

  const domain = email.split("@")[1];
  if (!domain || domain.includes("..") || domain.startsWith(".") || domain.endsWith(".")) {
    return { ok: false, reason: "malformed" };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, reason: "disposable" };
  }

  // DNS deliverability check: require real MX records.
  // We intentionally do NOT fall back to A/AAAA records — parked domains
  // (e.g. ds.com) resolve to a web host but cannot receive mail.
  try {
    const mx = await Deno.resolveDns(domain, "MX");
    const hasValidMx =
      Array.isArray(mx) &&
      mx.some((r) => {
        const exch = (r as { exchange?: string }).exchange?.trim().toLowerCase();
        // Reject "null MX" (RFC 7505): a single MX with empty/"." exchange.
        return !!exch && exch !== "." && exch !== "";
      });
    if (hasValidMx) return { ok: true, email };
  } catch {
    // fall through
  }

  return { ok: false, reason: "no_mx" };
}

export const EMAIL_ERROR_MESSAGE =
  "Please enter a valid email address. Temporary or inactive emails are not allowed.";
