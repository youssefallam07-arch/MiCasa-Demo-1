import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from './env';

export interface AuthUser { sub: string; role: string; name: string }
declare global { namespace Express { interface Request { user?: AuthUser } } }

export function signToken(u: AuthUser): string {
  return jwt.sign(u, ENV.JWT_SECRET, { expiresIn: ENV.JWT_EXPIRES as any });
}

// Short-lived token for admin "open as" impersonation. Carries the target
// user's identity plus an audit marker of which admin minted it.
export function signImpersonation(u: AuthUser, byAdminId: string): string {
  return jwt.sign({ ...u, imp: true, by: byAdminId }, ENV.JWT_SECRET, { expiresIn: '30m' });
}

// Attach req.user if a valid Bearer token is present (does not reject).
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    try { req.user = jwt.verify(h.slice(7), ENV.JWT_SECRET) as AuthUser; } catch { /* invalid -> anonymous */ }
  }
  next();
}

// Require a logged-in user with one of the given roles.
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
