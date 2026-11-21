import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import jwt from 'jsonwebtoken';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/repository.ts';

const JWT_SECRET =
  process.env.JWT_SECRET || 'vastraloom_dev_jwt_secret_change_in_production_2026';

export interface AdminJwtPayload {
  id: number;
  email: string;
  fullName: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: {
    id: number;
    uid: string;
    email: string;
    fullName: string;
    role: string;
  };
  admin?: AdminJwtPayload;
}

export function signAdminToken(payload: AdminJwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

export function verifyAdminJwt(token: string): AdminJwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AdminJwtPayload;
  } catch {
    return null;
  }
}

export const optionalFirebaseAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1]?.trim();
    if (token) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(token);
        req.user = decodedToken;
        if (decodedToken.email) {
          req.dbUser = await getOrCreateUser(
            decodedToken.uid,
            decodedToken.email,
            decodedToken.name || '',
          );
        }
      } catch {
        // Ignore invalid/non-firebase tokens on optional routes
      }
    }
  }
  next();
};

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    req.dbUser = await getOrCreateUser(
      decodedToken.uid,
      decodedToken.email || `${decodedToken.uid}@users.vastraloom.in`,
      decodedToken.name || '',
    );
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in as admin.' });
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  // 1. Check Admin JWT (for admin email/password login)
  const jwtAdmin = verifyAdminJwt(token);
  if (jwtAdmin && (jwtAdmin.role === 'admin' || jwtAdmin.role === 'manager')) {
    req.admin = jwtAdmin;
    next();
    return;
  }

  // 2. Check Firebase ID token (for Google Sign-In admin accounts)
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const dbUser = await getOrCreateUser(
      decodedToken.uid,
      decodedToken.email || '',
      decodedToken.name || '',
    );
    if (dbUser.role === 'admin' || dbUser.role === 'manager') {
      req.user = decodedToken;
      req.dbUser = dbUser;
      req.admin = {
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName,
        role: dbUser.role,
      };
      next();
      return;
    }
    res.status(403).json({ error: 'Admin privileges required.' });
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin session.' });
  }
};
