import type { RepoFile } from "./context-engine/types";

/**
 * A small but realistic layered TypeScript service, bundled so the app is fully
 * functional with no network and no API key. It's deliberately structured
 * (routes -> services -> repositories -> store, with auth + middleware + utils)
 * so that:
 *   1. focused questions select a tiny slice of a much larger repo — the token
 *      savings the product is about are visible immediately, and
 *   2. the engine's one-hop reference expansion has real chains to follow
 *      (e.g. routes/auth -> authService -> userRepo + jwt + password).
 */
const FILES: Array<{ path: string; text: string }> = [
  {
    path: "README.md",
    text: `# Notekeeper API

A small notes service with JWT auth, written in TypeScript on Express.
It is intentionally layered so the codebase reads like a real production service.

## Layers
- **routes/** — HTTP endpoints, thin. Parse input, call a service, shape the response.
- **services/** — business logic. No HTTP or storage details leak in here.
- **db/repositories/** — data access over a swappable store.
- **auth/** — password hashing and JWT signing/verification.
- **middleware/** — auth guard, rate limiting, request logging, error handling.
- **utils/** — logger, typed errors, validation, pagination.

## Running
- \`npm run dev\` starts the server on \`PORT\` (default 3000).
- \`npm test\` runs the unit tests in \`tests/\`.

See \`docs/architecture.md\` for the request lifecycle.
`,
  },
  {
    path: "docs/architecture.md",
    text: `# Architecture

## Request lifecycle
1. \`server.ts\` builds the Express app and mounts middleware in order:
   requestLogger -> json body parser -> rate limiter -> routers -> errorHandler.
2. Protected routers mount \`authGuard\`, which reads the session from the
   Authorization header and attaches \`req.userId\`.
3. Route handlers are thin: they validate input and delegate to a service.
4. Services contain the business rules and talk to repositories.
5. Repositories wrap the in-memory \`store\`. Swapping in Postgres means
   reimplementing only the repository layer.

## Auth
- Passwords are hashed with bcrypt (\`auth/password.ts\`).
- Sessions are stateless JWTs (\`auth/jwt.ts\`), issued on register/login and
  verified by \`authGuard\` on every protected request.

## Errors
- Services throw typed \`AppError\`s (\`utils/errors.ts\`).
- \`errorHandler\` converts them into JSON responses with the right status code.
`,
  },
  {
    path: "CONTRIBUTING.md",
    text: `# Contributing

- Keep routes thin: no business logic in \`routes/\`.
- New business rules go in a service under \`services/\`.
- Data access goes through a repository, never the store directly from a route.
- Throw a typed error from \`utils/errors.ts\` instead of returning ad-hoc shapes.
- Add a unit test under \`tests/\` for every new service method.
`,
  },
  {
    path: "src/config/env.ts",
    text: `// Central place that reads process.env, with sane development defaults.
function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: int('PORT', 3000),
  jwtSecret: str('JWT_SECRET', 'dev-secret-change-me'),
  jwtTtlSeconds: int('JWT_TTL_SECONDS', 60 * 60 * 24),
  bcryptRounds: int('BCRYPT_ROUNDS', 10),
  rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 120),
};

export const isProd = env.nodeEnv === 'production';
`,
  },
  {
    path: "src/config.ts",
    text: `import { env } from './config/env';

// Legacy shape kept for modules that import { config }. Prefer importing env.
export const config = {
  jwtSecret: env.jwtSecret,
  jwtTtlSeconds: env.jwtTtlSeconds,
  bcryptRounds: env.bcryptRounds,
  port: env.port,
};
`,
  },
  {
    path: "src/db/models.ts",
    text: `export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: number;
}
`,
  },
  {
    path: "src/types/api.ts",
    text: `// Data-transfer shapes for the HTTP boundary. Keep these free of storage fields.
export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateNoteRequest {
  title: string;
  body: string;
  tags?: string[];
}

export interface NoteResponse {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: number;
}

export interface PublicUser {
  id: string;
  email: string;
  createdAt: number;
}
`,
  },
  {
    path: "src/db/store.ts",
    text: `import type { Note, User } from './models';

// Low-level in-memory maps. Repositories are the only things that touch this.
export const store = {
  users: new Map<string, User>(),
  usersByEmail: new Map<string, User>(),
  notes: new Map<string, Note>(),
};

export function resetStore(): void {
  store.users.clear();
  store.usersByEmail.clear();
  store.notes.clear();
}
`,
  },
  {
    path: "src/db/repositories/userRepo.ts",
    text: `import { store } from '../store';
import type { User } from '../models';

// Data access for users. Swap the body for SQL and nothing above changes.
export const userRepo = {
  insert(user: User): User {
    store.users.set(user.id, user);
    store.usersByEmail.set(user.email.toLowerCase(), user);
    return user;
  },
  findByEmail(email: string): User | undefined {
    return store.usersByEmail.get(email.toLowerCase());
  },
  findById(id: string): User | undefined {
    return store.users.get(id);
  },
  existsByEmail(email: string): boolean {
    return store.usersByEmail.has(email.toLowerCase());
  },
};
`,
  },
  {
    path: "src/db/repositories/noteRepo.ts",
    text: `import { store } from '../store';
import type { Note } from '../models';

// Data access for notes, scoped by owner so users never see each other's data.
export const noteRepo = {
  insert(note: Note): Note {
    store.notes.set(note.id, note);
    return note;
  },
  findById(id: string): Note | undefined {
    return store.notes.get(id);
  },
  listByUser(userId: string): Note[] {
    return [...store.notes.values()]
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
  deleteOwned(id: string, userId: string): boolean {
    const note = store.notes.get(id);
    if (!note || note.userId !== userId) return false;
    return store.notes.delete(id);
  },
};
`,
  },
  {
    path: "src/auth/password.ts",
    text: `import bcrypt from 'bcryptjs';
import { env } from '../config/env';

// Hash a plaintext password for storage.
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.bcryptRounds);
}

// Compare a login attempt against a stored hash.
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
`,
  },
  {
    path: "src/auth/jwt.ts",
    text: `import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload {
  sub: string; // user id
  email: string;
}

// Sign a short-lived session token.
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtTtlSeconds });
}

// Verify and decode a session token. Throws if invalid or expired.
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
}
`,
  },
  {
    path: "src/auth/session.ts",
    text: `import { signToken, verifyToken, type TokenPayload } from './jwt';

// Build the Authorization header value for a freshly issued session.
export function issueSession(payload: TokenPayload): string {
  return 'Bearer ' + signToken(payload);
}

// Pull the user out of a raw Authorization header, or null if absent/invalid.
export function readSession(authHeader: string | undefined): TokenPayload | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    return verifyToken(authHeader.slice('Bearer '.length));
  } catch {
    return null;
  }
}
`,
  },
  {
    path: "src/utils/errors.ts",
    text: `// Typed application errors. The error handler maps these onto HTTP responses.
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}
`,
  },
  {
    path: "src/utils/logger.ts",
    text: `import { isProd } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, meta?: unknown): void {
  if (level === 'debug' && isProd) return;
  const line = '[' + new Date().toISOString() + '] ' + level.toUpperCase() + ' ' + msg;
  if (meta !== undefined) console.log(line, meta);
  else console.log(line);
}

export const logger = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
`,
  },
  {
    path: "src/utils/validate.ts",
    text: `import { ValidationError } from './errors';

export function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(value);
}

export function isStrongPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8;
}

// Validate note input and throw a ValidationError describing the first problem.
export function assertNoteInput(input: { title?: unknown; body?: unknown }): void {
  if (typeof input.title !== 'string' || input.title.trim().length === 0) {
    throw new ValidationError('Title is required');
  }
  if (typeof input.body !== 'string') {
    throw new ValidationError('Body must be a string');
  }
}
`,
  },
  {
    path: "src/utils/pagination.ts",
    text: `export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// Clamp user-supplied paging params and slice a list into a Page.
export function paginate<T>(all: T[], rawLimit: unknown, rawOffset: unknown): Page<T> {
  const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 100);
  const offset = Math.max(Number(rawOffset) || 0, 0);
  return {
    items: all.slice(offset, offset + limit),
    total: all.length,
    limit,
    offset,
  };
}
`,
  },
  {
    path: "src/utils/asyncHandler.ts",
    text: `import type { NextFunction, Request, Response } from 'express';

// Wrap an async route so thrown errors reach the error-handling middleware.
type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}
`,
  },
  {
    path: "src/services/authService.ts",
    text: `import { randomUUID } from 'crypto';
import { userRepo } from '../db/repositories/userRepo';
import { hashPassword, verifyPassword } from '../auth/password';
import { signToken } from '../auth/jwt';
import { isEmail, isStrongPassword } from '../utils/validate';
import { ConflictError, UnauthorizedError, ValidationError } from '../utils/errors';
import type { LoginRequest, RegisterRequest } from '../types/api';

// Create a user and return a fresh session token.
export async function register(input: RegisterRequest): Promise<{ token: string }> {
  if (!isEmail(input.email)) throw new ValidationError('Invalid email');
  if (!isStrongPassword(input.password)) throw new ValidationError('Password must be at least 8 characters');
  if (userRepo.existsByEmail(input.email)) throw new ConflictError('Email already in use');

  const user = userRepo.insert({
    id: randomUUID(),
    email: input.email,
    passwordHash: await hashPassword(input.password),
    createdAt: Date.now(),
  });
  return { token: signToken({ sub: user.id, email: user.email }) };
}

// Verify credentials and return a fresh session token.
export async function login(input: LoginRequest): Promise<{ token: string }> {
  const user = userRepo.findByEmail(String(input.email ?? ''));
  const ok = user && (await verifyPassword(String(input.password ?? ''), user.passwordHash));
  if (!user || !ok) throw new UnauthorizedError('Invalid credentials');
  return { token: signToken({ sub: user.id, email: user.email }) };
}
`,
  },
  {
    path: "src/services/noteService.ts",
    text: `import { randomUUID } from 'crypto';
import { noteRepo } from '../db/repositories/noteRepo';
import { assertNoteInput } from '../utils/validate';
import { NotFoundError } from '../utils/errors';
import { paginate, type Page } from '../utils/pagination';
import type { CreateNoteRequest, NoteResponse } from '../types/api';
import type { Note } from '../db/models';

function toResponse(note: Note): NoteResponse {
  return { id: note.id, title: note.title, body: note.body, tags: note.tags, updatedAt: note.updatedAt };
}

export function listNotes(userId: string, limit: unknown, offset: unknown): Page<NoteResponse> {
  const all = noteRepo.listByUser(userId).map(toResponse);
  return paginate(all, limit, offset);
}

export function createNote(userId: string, input: CreateNoteRequest): NoteResponse {
  assertNoteInput(input);
  const note = noteRepo.insert({
    id: randomUUID(),
    userId,
    title: input.title,
    body: input.body,
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 16) : [],
    updatedAt: Date.now(),
  });
  return toResponse(note);
}

export function deleteNote(userId: string, id: string): void {
  const ok = noteRepo.deleteOwned(id, userId);
  if (!ok) throw new NotFoundError('Note not found');
}
`,
  },
  {
    path: "src/services/userService.ts",
    text: `import { userRepo } from '../db/repositories/userRepo';
import { NotFoundError } from '../utils/errors';
import type { PublicUser } from '../types/api';

// Return the safe, public view of a user (never the password hash).
export function getPublicUser(id: string): PublicUser {
  const user = userRepo.findById(id);
  if (!user) throw new NotFoundError('User not found');
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}
`,
  },
  {
    path: "src/middleware/authGuard.ts",
    text: `import type { NextFunction, Request, Response } from 'express';
import { readSession } from '../auth/session';
import { UnauthorizedError } from '../utils/errors';

// Reject requests without a valid session; attach the user id otherwise.
export function authGuard(req: Request, _res: Response, next: NextFunction): void {
  const session = readSession(req.header('authorization'));
  if (!session) throw new UnauthorizedError();
  (req as Request & { userId: string }).userId = session.sub;
  next();
}
`,
  },
  {
    path: "src/middleware/errorHandler.ts",
    text: `import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// Central error handler: typed AppErrors become clean JSON, everything else 500s.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  logger.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
}
`,
  },
  {
    path: "src/middleware/requestLogger.ts",
    text: `import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

// Log each request with its status and duration once the response finishes.
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(req.method + ' ' + req.path + ' -> ' + res.statusCode + ' (' + (Date.now() - start) + 'ms)');
  });
  next();
}
`,
  },
  {
    path: "src/middleware/rateLimit.ts",
    text: `import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

// Naive fixed-window rate limiter keyed by client IP. Fine for a demo.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = hits.get(key);
  if (!bucket || now > bucket.resetAt) {
    hits.set(key, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  bucket.count++;
  if (bucket.count > env.rateLimitPerMinute) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }
  next();
}
`,
  },
  {
    path: "src/routes/auth.ts",
    text: `import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { login, register } from '../services/authService';

export const authRouter = Router();

// POST /auth/register — create an account, return a session token.
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const result = await register(req.body ?? {});
    res.status(201).json(result);
  }),
);

// POST /auth/login — verify credentials, return a session token.
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const result = await login(req.body ?? {});
    res.json(result);
  }),
);
`,
  },
  {
    path: "src/routes/notes.ts",
    text: `import { Router } from 'express';
import { authGuard } from '../middleware/authGuard';
import { asyncHandler } from '../utils/asyncHandler';
import { createNote, deleteNote, listNotes } from '../services/noteService';

export const notesRouter = Router();

notesRouter.use(authGuard);

function userIdOf(req: { userId?: string }): string {
  return req.userId as string;
}

// GET /notes — list the current user's notes, paginated.
notesRouter.get(
  '/',
  asyncHandler((req, res) => {
    const page = listNotes(userIdOf(req as never), req.query.limit, req.query.offset);
    res.json(page);
  }),
);

// POST /notes — create a note owned by the current user.
notesRouter.post(
  '/',
  asyncHandler((req, res) => {
    const note = createNote(userIdOf(req as never), req.body ?? {});
    res.status(201).json({ note });
  }),
);

// DELETE /notes/:id — delete a note the user owns.
notesRouter.delete(
  '/:id',
  asyncHandler((req, res) => {
    deleteNote(userIdOf(req as never), req.params.id);
    res.status(204).end();
  }),
);
`,
  },
  {
    path: "src/routes/users.ts",
    text: `import { Router } from 'express';
import { authGuard } from '../middleware/authGuard';
import { asyncHandler } from '../utils/asyncHandler';
import { getPublicUser } from '../services/userService';

export const usersRouter = Router();

usersRouter.use(authGuard);

// GET /users/me — return the current user's public profile.
usersRouter.get(
  '/me',
  asyncHandler((req, res) => {
    const userId = (req as { userId: string }).userId;
    res.json({ user: getPublicUser(userId) });
  }),
);
`,
  },
  {
    path: "src/routes/health.ts",
    text: `import { Router } from 'express';

export const healthRouter = Router();

// GET /health — liveness probe.
healthRouter.get('/', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});
`,
  },
  {
    path: "src/server.ts",
    text: `import express from 'express';
import { env } from './config/env';
import { logger } from './utils/logger';
import { requestLogger } from './middleware/requestLogger';
import { rateLimit } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { notesRouter } from './routes/notes';
import { usersRouter } from './routes/users';
import { healthRouter } from './routes/health';

export function createServer() {
  const app = express();
  app.use(requestLogger);
  app.use(express.json());
  app.use(rateLimit);

  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/notes', notesRouter);
  app.use('/users', usersRouter);

  app.use(errorHandler);
  return app;
}

if (require.main === module) {
  createServer().listen(env.port, () => {
    logger.info('Notekeeper API listening on port ' + env.port);
  });
}
`,
  },
  {
    path: "tests/auth.test.ts",
    text: `import { describe, expect, it, beforeEach } from 'vitest';
import { resetStore } from '../src/db/store';
import { login, register } from '../src/services/authService';

describe('authService', () => {
  beforeEach(() => resetStore());

  it('registers a new user and returns a token', async () => {
    const { token } = await register({ email: 'a@b.com', password: 'supersecret' });
    expect(typeof token).toBe('string');
  });

  it('rejects a weak password', async () => {
    await expect(register({ email: 'a@b.com', password: 'short' })).rejects.toThrow();
  });

  it('logs in with correct credentials', async () => {
    await register({ email: 'a@b.com', password: 'supersecret' });
    const { token } = await login({ email: 'a@b.com', password: 'supersecret' });
    expect(token).toBeTruthy();
  });

  it('rejects a bad password on login', async () => {
    await register({ email: 'a@b.com', password: 'supersecret' });
    await expect(login({ email: 'a@b.com', password: 'wrongpass1' })).rejects.toThrow();
  });
});
`,
  },
  {
    path: "tests/notes.test.ts",
    text: `import { describe, expect, it, beforeEach } from 'vitest';
import { resetStore } from '../src/db/store';
import { createNote, deleteNote, listNotes } from '../src/services/noteService';

describe('noteService', () => {
  beforeEach(() => resetStore());

  it('creates and lists a note for its owner', () => {
    createNote('user-1', { title: 'First', body: 'hello' });
    const page = listNotes('user-1', 20, 0);
    expect(page.total).toBe(1);
    expect(page.items[0].title).toBe('First');
  });

  it('does not leak notes across users', () => {
    createNote('user-1', { title: 'Mine', body: 'x' });
    const page = listNotes('user-2', 20, 0);
    expect(page.total).toBe(0);
  });

  it('deletes only notes the caller owns', () => {
    const note = createNote('user-1', { title: 'Mine', body: 'x' });
    expect(() => deleteNote('user-2', note.id)).toThrow();
    expect(() => deleteNote('user-1', note.id)).not.toThrow();
  });
});
`,
  },
];

export const DEMO_REPO = {
  name: "notekeeper-api",
  label: "notekeeper-api (bundled demo)",
  files: FILES.map<RepoFile>((f) => ({
    path: f.path,
    text: f.text,
    bytes: new TextEncoder().encode(f.text).length,
  })),
};

export const DEMO_QUESTIONS = [
  "How does authentication work end to end?",
  "Where are passwords hashed and verified?",
  "How are notes kept private to their owner?",
  "How are errors turned into HTTP responses?",
];
