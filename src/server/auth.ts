import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

const RUNTIME_SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

export interface AuthenticatedUser {
  id: number;
  uid: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
  status: 'ACTIVE' | 'DISABLED';
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

interface SessionPayload {
  userId: number;
  uid: string;
  role: 'ADMIN' | 'STAFF';
  exp: number;
}

export function signSessionToken(user: AuthenticatedUser): string {
  const payload: SessionPayload = {
    userId: user.id,
    uid: user.uid,
    role: user.role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `webx.${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token.startsWith('webx.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.userId || !payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function hasAnyAdminUser(): Promise<boolean> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'ADMIN'))
    .limit(1);
  return existing.length > 0;
}

export async function bootstrapFirstAdmin(params: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthenticatedUser> {
  return await db.transaction(async (tx) => {
    const existingAdmin = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'ADMIN'))
      .limit(1);
    if (existingAdmin.length > 0) {
      throw new Error('Workspace administrator is already configured.');
    }

    const email = params.email.trim().toLowerCase();
    const uid = `admin_${crypto.randomUUID()}`;
    const inserted = await tx
      .insert(users)
      .values({
        uid,
        name: params.name.trim(),
        email,
        passwordHash: hashPassword(params.password),
        role: 'ADMIN',
        status: 'ACTIVE',
      })
      .returning();

    const row = inserted[0];
    return {
      id: row.id,
      uid: row.uid,
      name: row.name,
      email: row.email,
      role: row.role as 'ADMIN' | 'STAFF',
      status: row.status as 'ACTIVE' | 'DISABLED',
    };
  });
}

export async function getOrCreateFirebaseUser(
  uid: string,
  email: string,
  name?: string
): Promise<AuthenticatedUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const ownerEmail = (process.env.ADMIN_OWNER_EMAIL || '').trim().toLowerCase();

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(884201)`);

    const existingByUid = await tx.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (existingByUid[0]) {
      const u = existingByUid[0];
      const updated = await tx
        .update(users)
        .set({
          email: normalizedEmail,
          name: name?.trim() || u.name,
        })
        .where(eq(users.id, u.id))
        .returning();
      const row = updated[0];
      return {
        id: row.id,
        uid: row.uid,
        name: row.name,
        email: row.email,
        role: row.role as 'ADMIN' | 'STAFF',
        status: row.status as 'ACTIVE' | 'DISABLED',
      };
    }

    const existingByEmail = await tx
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existingByEmail[0]) {
      const u = existingByEmail[0];
      const updated = await tx
        .update(users)
        .set({
          uid,
          name: name?.trim() || u.name,
        })
        .where(eq(users.id, u.id))
        .returning();
      const row = updated[0];
      return {
        id: row.id,
        uid: row.uid,
        name: row.name,
        email: row.email,
        role: row.role as 'ADMIN' | 'STAFF',
        status: row.status as 'ACTIVE' | 'DISABLED',
      };
    }

    const existingAdmins = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'ADMIN'))
      .limit(1);
    const role: 'ADMIN' | 'STAFF' =
      existingAdmins.length === 0 || (ownerEmail && normalizedEmail === ownerEmail)
        ? 'ADMIN'
        : 'STAFF';

    const result = await tx
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        name: name?.trim() || normalizedEmail.split('@')[0],
        role,
        status: 'ACTIVE',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
        },
      })
      .returning();

    const row = result[0];
    return {
      id: row.id,
      uid: row.uid,
      name: row.name,
      email: row.email,
      role: row.role as 'ADMIN' | 'STAFF',
      status: row.status as 'ACTIVE' | 'DISABLED',
    };
  });
}

export async function verifyAuthToken(token: string): Promise<AuthenticatedUser | null> {
  if (!token) return null;

  if (token.startsWith('webx.')) {
    const payload = verifySessionToken(token);
    if (!payload) return null;
    const rows = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    const user = rows[0];
    if (!user || user.status !== 'ACTIVE') return null;
    return {
      id: user.id,
      uid: user.uid,
      name: user.name,
      email: user.email,
      role: user.role as 'ADMIN' | 'STAFF',
      status: user.status as 'ACTIVE' | 'DISABLED',
    };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const email = decodedToken.email;
    if (!email) return null;
    const dbUser = await getOrCreateFirebaseUser(decodedToken.uid, email, decodedToken.name);
    if (dbUser.status !== 'ACTIVE') return null;
    return dbUser;
  } catch {
    return null;
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const verified = await verifyAuthToken(token);
    if (!verified) {
      res.status(401).json({ error: 'Unauthorized: Invalid, expired, or disabled session' });
      return;
    }
    req.user = verified;
    next();
  } catch (error) {
    console.error('Error verifying authentication token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
    return;
  }
  next();
};
