import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

function build(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof build>;

// One Drizzle instance per binding per isolate; building it walks the whole schema.
const cache = new WeakMap<D1Database, Db>();

export function createDb(d1: D1Database): Db {
  let db = cache.get(d1);
  if (!db) {
    db = build(d1);
    cache.set(d1, db);
  }
  return db;
}
