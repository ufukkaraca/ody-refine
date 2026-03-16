/**
 * SQLite implementations barrel export.
 * @module sqlite
 */
export { openDatabase } from './connection.js';
export { createSchema } from './schema.js';
export { SQLiteNodeRepository } from './node-repository.js';
export { SQLiteEdgeRepository } from './edge-repository.js';
export { SqliteVecIndex } from './vec-index.js';
