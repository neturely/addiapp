import { Resend } from 'resend'
import type { EmailMessage, EmailService } from './types.js'

/** Resend-backed transport. Used whenever RESEND_API_KEY is set. */
export class ResendEmailService implements EmailService {
  private readonly client: Resend

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey)
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.text ? { text: message.text } : {}),
    })
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`)
    }
  }
}
