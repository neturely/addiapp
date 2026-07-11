import 'dotenv/config'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'

/**
 * Applies any pending migrations from ./drizzle against DATABASE_URL.
 * Run with: npm run db:migrate -w server
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set (see server/.env.example)')
  }

  const connection = await mysql.createConnection(process.env.DATABASE_URL)
  const db = drizzle(connection)

  console.log('[addiapp] applying migrations…')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('[addiapp] migrations applied')

  await connection.end()
}

main().catch((err) => {
  console.error('[addiapp] migration failed:', err)
  process.exit(1)
})
