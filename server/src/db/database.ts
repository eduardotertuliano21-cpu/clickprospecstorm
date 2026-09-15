import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { CONFIG } from '../config.js';

export interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  updatedAt: string;
}

export interface CustomerLicense {
  id: string;
  customerName: string;
  customerEmail: string;
  phone?: string;
  licenseKey: string;
  licenseType: 'pro' | 'trial';
  status: 'active' | 'blocked' | 'expired';
  isTrial: boolean;
  dailyLimit: number;
  machineId: string | null;
  currentAppVersion: string | null;
  expiresAt: string | null;
  lastHandshakeAt: string | null;
  notes?: string;
  pricePaid?: number;
  tempPassword?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppVersionConfig {
  minVersionRequired: string;
  latestVersion: string;
  downloadUrl: string;
  forceUpdateMessage: string;
  updatedAt: string;
}

interface DatabaseSchema {
  admin: AdminUser;
  customers: CustomerLicense[];
  versionConfig: AppVersionConfig;
}

class Database {
  private filePath: string;
  private data: DatabaseSchema;

  constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = path.join(dataDir, 'database.json');
    this.data = this.loadData();
  }

  private loadData(): DatabaseSchema {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(raw);
      } catch (err) {
        console.error('[DB] Erro ao ler database.json, recriando inicial:', err);
      }
    }

    const defaultAdmin: AdminUser = {
      id: 'admin-master',
      email: CONFIG.ADMIN_EMAIL,
      passwordHash: bcrypt.hashSync(CONFIG.ADMIN_DEFAULT_PASSWORD, 10),
      updatedAt: new Date().toISOString()
    };

    const defaultVersions: AppVersionConfig = {
      minVersionRequired: CONFIG.DEFAULT_MIN_VERSION,
      latestVersion: CONFIG.DEFAULT_LATEST_VERSION,
      downloadUrl: 'https://github.com/clickleadstorm/desktop/releases',
      forceUpdateMessage: 'Esta versão do Click Lead Storm foi descontinuada. É obrigatório atualizar para continuar utilizando.',
      updatedAt: new Date().toISOString()
    };

    const initialData: DatabaseSchema = {
      admin: defaultAdmin,
      customers: [
        {
          id: 'cust-demo-1',
          customerName: 'Cliente Demonstração B2B',
          customerEmail: 'demo@clickleadstorm.com',
          phone: '+55 11 99999-8888',
          licenseKey: 'CLS-TRIAL-8842-9910',
          licenseType: 'trial',
          status: 'active',
          isTrial: true,
          dailyLimit: 20,
          machineId: null,
          currentAppVersion: '1.0.0',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          lastHandshakeAt: new Date().toISOString(),
          notes: 'Licença trial de 7 dias padrão',
          pricePaid: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      versionConfig: defaultVersions
    };

    this.saveData(initialData);
    return initialData;
  }

  private saveData(dataToSave?: DatabaseSchema): void {
    try {
      const payload = dataToSave || this.data;
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.error('[DB] Falha ao persistir database.json:', err);
    }
  }

  // Métodos Admin
  public getAdmin(): AdminUser {
    return this.data.admin;
  }

  public updateAdminPassword(newPasswordHash: string): void {
    this.data.admin.passwordHash = newPasswordHash;
    this.data.admin.updatedAt = new Date().toISOString();
    this.saveData();
  }

  // Métodos de Versão
  public getVersionConfig(): AppVersionConfig {
    return this.data.versionConfig;
  }

  public updateVersionConfig(config: Partial<AppVersionConfig>): AppVersionConfig {
    this.data.versionConfig = {
      ...this.data.versionConfig,
      ...config,
      updatedAt: new Date().toISOString()
    };
    this.saveData();
    return this.data.versionConfig;
  }

  // Métodos de Clientes e Licenças
  public getAllCustomers(): CustomerLicense[] {
    return this.data.customers;
  }

  public findCustomerById(id: string): CustomerLicense | undefined {
    return this.data.customers.find(c => c.id === id);
  }

  public findCustomerByLicenseKey(key: string): CustomerLicense | undefined {
    const clean = (key || '').trim().toUpperCase();
    return this.data.customers.find(c => c.licenseKey.toUpperCase() === clean);
  }

  public createCustomerLicense(data: Omit<CustomerLicense, 'id' | 'createdAt' | 'updatedAt' | 'lastHandshakeAt' | 'machineId' | 'currentAppVersion'>): CustomerLicense {
    const newCustomer: CustomerLicense = {
      ...data,
      id: `cust-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      machineId: null,
      currentAppVersion: null,
      lastHandshakeAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.customers.unshift(newCustomer);
    this.saveData();
    return newCustomer;
  }

  public updateCustomer(id: string, changes: Partial<CustomerLicense>): CustomerLicense | null {
    const idx = this.data.customers.findIndex(c => c.id === id);
    if (idx === -1) return null;

    this.data.customers[idx] = {
      ...this.data.customers[idx],
      ...changes,
      updatedAt: new Date().toISOString()
    };

    this.saveData();
    return this.data.customers[idx];
  }

  public deleteCustomer(id: string): boolean {
    const prevLen = this.data.customers.length;
    this.data.customers = this.data.customers.filter(c => c.id !== id);
    if (this.data.customers.length !== prevLen) {
      this.saveData();
      return true;
    }
    return false;
  }
}

export const db = new Database();
