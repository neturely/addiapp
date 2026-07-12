import 'dotenv/config'

/** Central runtime config sourced from the environment (see server/.env.example). */
export const config = {
  isProd: process.env.NODE_ENV === 'production',
  // Base URL of the frontend SPA — used to build links in emails.
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  // Resend transactional email. If the API key is absent we fall back to the
  // console email transport (dev/test mode) — see server/src/email/index.ts.
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  // Verified sender identity. `onboarding@resend.dev` works without domain
  // verification and is a safe default for local/test.
  emailFrom: process.env.ADDIAPP_EMAIL_FROM ?? 'AddiApp <onboarding@resend.dev>',
}
