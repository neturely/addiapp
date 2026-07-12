import { config } from '../config.js'
import type { EmailMessage } from './types.js'

const wrap = (heading: string, body: string) =>
  `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:auto">
    <h2>${heading}</h2>
    ${body}
    <p style="color:#888;font-size:12px;margin-top:24px">AddiApp · addiapp.com</p>
  </div>`

export function verificationEmail(to: string, token: string): EmailMessage {
  const link = `${config.appUrl}/verify?token=${token}`
  return {
    to,
    subject: 'Verify your AddiApp email',
    html: wrap(
      'Welcome to AddiApp 🎉',
      `<p>Confirm your email address to activate your account:</p>
       <p><a href="${link}">Verify my email</a></p>
       <p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${link}</p>
       <p style="color:#666;font-size:13px">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>`,
    ),
    text: `Welcome to AddiApp! Verify your email: ${link} (expires in 24 hours). If you didn't sign up, ignore this email.`,
  }
}

export function passwordResetEmail(to: string, token: string): EmailMessage {
  const link = `${config.appUrl}/reset?token=${token}`
  return {
    to,
    subject: 'Reset your AddiApp password',
    html: wrap(
      'Reset your password',
      `<p>We got a request to reset your AddiApp password. Choose a new one here:</p>
       <p><a href="${link}">Reset my password</a></p>
       <p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${link}</p>
       <p style="color:#666;font-size:13px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
    ),
    text: `Reset your AddiApp password: ${link} (expires in 1 hour). If you didn't request this, ignore this email — your password won't change.`,
  }
}
