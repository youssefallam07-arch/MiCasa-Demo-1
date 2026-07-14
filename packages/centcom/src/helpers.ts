import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from './core';

// wrap async handlers so thrown errors reach the error middleware
export const h = (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

// validate req.body against a zod schema; replaces body with the parsed value
export const body = <T extends z.ZodTypeAny>(schema: T) =>
  (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body);
    if (!r.success) return res.status(400).json({ error: 'validation', issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    req.body = r.data;
    next();
  };

// consistent error shape for every endpoint
export function errorHandler(e: any, _req: Request, res: Response, _next: NextFunction) {
  if (e instanceof AppError) return res.status(e.status).json({ error: e.code });
  if (e instanceof ZodError) return res.status(400).json({ error: 'validation' });
  console.error('[centcom] unhandled:', e?.message || e);
  return res.status(500).json({ error: 'server_error' });
}
