import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../libs/db.js';
import logger from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Ensure the migration tracking table exists.
 */
async function ensureMigrationTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Get the set of already-applied migration names.
 */
async function getAppliedMigrations(conn) {
  const [rows] = await conn.execute('SELECT name FROM schema_migrations ORDER BY id');
  return new Set(rows.map((r) => r.name));
}

/**
 * Run all pending migrations in order.
 */
export async function migrate() {
  const conn = await pool.getConnection();
  try {
    await ensureMigrationTable(conn);
    const applied = await getAppliedMigrations(conn);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      logger.info('No pending migrations');
      return;
    }

    for (const file of pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
      logger.info(`Running migration: ${file}`);

      await conn.beginTransaction();
      try {
        // Split by semicolon to support multiple statements
        const statements = sql
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean);

        for (const stmt of statements) {
          await conn.execute(stmt);
        }
        await conn.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
        await conn.commit();
        logger.info(`Migration applied: ${file}`);
      } catch (err) {
        await conn.rollback();
        throw new Error(`Migration failed [${file}]: ${err.message}`);
      }
    }

    logger.info(`Applied ${pending.length} migration(s)`);
  } finally {
    conn.release();
  }
}
