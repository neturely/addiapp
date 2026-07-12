export type EmailMessage = {
  to: string
  subject: string
  html: string
  text?: string
}

/** Provider-agnostic transactional email transport. Swapping providers should
 * only touch this folder, never the auth routes. */
export interface EmailService {
  send(message: EmailMessage): Promise<void>
}
