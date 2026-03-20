/**
 * SQLite database connection with sqlite-vec extension.
 * @module sqlite/connection
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

/**
 * Open a SQLite database with WAL mode, foreign keys, and sqlite-vec loaded.
 * @param dbPath - Path to the database file, or ':memory:' for in-memory.
 */
export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  sqliteVec.load(db);
  return db;
}
