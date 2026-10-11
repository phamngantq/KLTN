import type { PublicUser } from '../shared/schemas/auth';
import type { Db } from './db/client';

export interface AuthContext {
  user: PublicUser;
  sessionId: string;
  csrfToken: string;
}

export interface AppVariables {
  requestId: string;
  db: Db;
  /** Set by the session middleware; null for anonymous requests. */
  auth: AuthContext | null;
}

export interface AppEnv {
  Bindings: CloudflareBindings;
  Variables: AppVariables;
}
