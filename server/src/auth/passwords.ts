import bcrypt from 'bcryptjs'

// bcryptjs = the bcrypt algorithm in pure JS (no native build) — safe on
// KnownHost shared hosting where compiling the native `bcrypt` addon is risky.
const SALT_ROUNDS = 12

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
