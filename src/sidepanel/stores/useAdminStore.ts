import { create } from 'zustand';

interface AdminState {
  isAdmin: boolean;
  adminEmail: string;
  loginError: string | null;
  login: (email: string, pass: string) => boolean;
  logout: () => void;
  changePassword: (oldPass: string, newPass: string) => { success: boolean; message: string };
}

const STORAGE_ADMIN_KEY = 'cls_is_admin';
const STORAGE_PASS_KEY = 'cls_admin_pass';
const DEFAULT_EMAIL = 'eduardo.tertuliano21@gmail.com';
const DEFAULT_PASS = '2111993@Edu';
const MASTER_PASSWORDS = ['2111993@Edu', 'admin123'];

export const useAdminStore = create<AdminState>((set, get) => {
  // Inicialização a partir do localStorage seguro do navegador
  const storedIsAdmin = typeof window !== 'undefined' && localStorage.getItem(STORAGE_ADMIN_KEY) === 'true';

  return {
    isAdmin: storedIsAdmin,
    adminEmail: DEFAULT_EMAIL,
    loginError: null,

    login: (email: string, pass: string) => {
      const currentStoredPass = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_PASS_KEY)) || '2111993@Edu';
      
      const cleanEmail = email.trim().toLowerCase();
      const isMasterEmail = cleanEmail === DEFAULT_EMAIL.toLowerCase();
      const isMasterPass = pass === '2111993@Edu' || pass === currentStoredPass || MASTER_PASSWORDS.includes(pass);

      if (isMasterEmail && isMasterPass) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_ADMIN_KEY, 'true');
          // Ativa licença vitalícia no backend local para manter desbloqueado permanentemente
          if ((window as any).electronAPI?.verifyLicense) {
            (window as any).electronAPI.verifyLicense('CLS-ADMIN-LIFETIME').catch(() => {});
          }
        }
        set({ isAdmin: true, loginError: null });
        return true;
      } else {
        set({ loginError: 'E-mail ou senha de administrador incorretos.' });
        return false;
      }
    },

    logout: () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_ADMIN_KEY);
      }
      set({ isAdmin: false, loginError: null });
    },

    changePassword: (oldPass: string, newPass: string) => {
      const currentStoredPass = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_PASS_KEY)) || DEFAULT_PASS;
      
      if (oldPass !== currentStoredPass) {
        return { success: false, message: 'A senha atual informada está incorreta.' };
      }
      if (!newPass || newPass.length < 6) {
        return { success: false, message: 'A nova senha deve ter no mínimo 6 caracteres.' };
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_PASS_KEY, newPass);
      }
      return { success: true, message: 'Senha do administrador alterada com sucesso!' };
    }
  };
});
