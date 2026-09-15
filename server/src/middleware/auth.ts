import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config.js';

export interface AuthRequest extends Request {
  adminUser?: {
    email: string;
    role: string;
  };
}

export const requireAdminAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Acesso restrito. Token de autenticação não fornecido.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET) as { email: string; role: string };
    if (!decoded || decoded.role !== 'master_admin') {
      res.status(403).json({ success: false, error: 'Acesso negado. Privilégios insuficientes.' });
      return;
    }
    req.adminUser = decoded;
    next();
  } catch (err: any) {
    res.status(401).json({ success: false, error: 'Sessão expirada ou token inválido. Faça login novamente.' });
  }
};
