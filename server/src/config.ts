import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 4000,
  JWT_SECRET: process.env.JWT_SECRET || 'click-lead-storm-master-secret-key-2026-b2b',
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'eduardo.tertuliano21@gmail.com').toLowerCase(),
  ADMIN_DEFAULT_PASSWORD: process.env.ADMIN_DEFAULT_PASSWORD || 'admin123',
  TOKEN_EXPIRY: '7d',
  DEFAULT_MIN_VERSION: '1.0.0',
  DEFAULT_LATEST_VERSION: '1.0.0'
};
