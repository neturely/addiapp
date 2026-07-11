import { config } from '../config.js'
import type { EmailService } from './types.js'
import { ResendEmailService } from './resend.js'
import { ConsoleEmailService } from './console.js'

function createEmailService(): EmailService {
  if (config.resendApiKey) {
    return new ResendEmailService(config.resendApiKey, config.emailFrom)
  }
  console.warn('[addiapp] RESEND_API_KEY not set — using console email transport (dev/test mode)')
  return new ConsoleEmailService()
}

export const emailService: EmailService = createEmailService()
export type { EmailMessage, EmailService } from './types.js'
