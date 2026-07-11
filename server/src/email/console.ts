import type { EmailMessage, EmailService } from './types.js'

/**
 * Dev/test transport: logs the email (and any links) to the console instead of
 * sending. Active when RESEND_API_KEY is unset, so the full flow can be exercised
 * locally without a real provider key.
 */
export class ConsoleEmailService implements EmailService {
  async send(message: EmailMessage): Promise<void> {
    const links = message.html.match(/https?:\/\/[^"'\s]+/g) ?? []
    console.log('\n──── [email:console] (RESEND_API_KEY unset — not actually sent) ────')
    console.log(`  to:      ${message.to}`)
    console.log(`  subject: ${message.subject}`)
    for (const link of links) console.log(`  link:    ${link}`)
    console.log('────────────────────────────────────────────────────────────────\n')
    return Promise.resolve()
  }
}
