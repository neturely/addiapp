import 'dotenv/config'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import * as schema from './schema.js'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set (see server/.env.example)')
}

const pool = mysql.createPool(process.env.DATABASE_URL)

export const db = drizzle(pool, { schema, mode: 'default' })
export { schema }
