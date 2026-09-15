import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { CONFIG } from '../config.js';
import { requireAdminAuth, AuthRequest } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Informe e-mail e senha.' });
      return;
    }

    const admin = db.getAdmin();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail !== admin.email.toLowerCase()) {
      res.status(401).json({ success: false, error: 'Credenciais de administrador incorretas.' });
      return;
    }

    const passwordMatches = bcrypt.compareSync(password, admin.passwordHash);
    if (!passwordMatches) {
      res.status(401).json({ success: false, error: 'Credenciais de administrador incorretas.' });
      return;
    }

    const token = jwt.sign(
      { email: admin.email, role: 'master_admin' },
      CONFIG.JWT_SECRET,
      { expiresIn: CONFIG.TOKEN_EXPIRY as any }
    );

    res.json({
      success: true,
      token,
      admin: {
        email: admin.email
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Erro no login administrativo: ${err.message}` });
  }
});

authRouter.post('/change-password', requireAdminAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: 'Informe a senha atual e a nova senha.' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    const admin = db.getAdmin();
    const matches = bcrypt.compareSync(currentPassword, admin.passwordHash);
    if (!matches) {
      res.status(401).json({ success: false, error: 'A senha atual informada está incorreta.' });
      return;
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.updateAdminPassword(newHash);

    res.json({ success: true, message: 'Senha da conta mestre alterada com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
