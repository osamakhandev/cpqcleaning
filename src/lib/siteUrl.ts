// Production site URL used for auth email redirects (password reset, invites).
// Override via VITE_SITE_URL when needed (e.g. custom domain).
export const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined) ??
  "https://cpq-web-master-v1-1.lovable.app";
