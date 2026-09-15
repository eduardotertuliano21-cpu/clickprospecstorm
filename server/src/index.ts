import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { licenseRouter } from './routes/license.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middlewares essenciais
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Rotas da API
app.use('/api/v1/admin', authRouter); // Login & change-password
app.use('/api/v1/admin', adminRouter); // Gestão, métricas, licenças
app.use('/api/v1/license', licenseRouter); // Handshake desktop

// Health check da API
app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'online',
    service: 'Click Lead Storm Master License Server',
    timestamp: new Date().toISOString()
  });
});

// Arquivos estáticos do Painel Web Master
const publicPath = path.resolve(__dirname, '../public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const indexHtml = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.sendFile(indexHtml);
    } else {
      next();
    }
  });
}

const server = app.listen(CONFIG.PORT, () => {
  console.log(`\n======================================================`);
  console.log(`⚡ Click Lead Storm - Servidor Central & Painel Master`);
  console.log(`📡 API REST rodando em: http://localhost:${CONFIG.PORT}`);
  console.log(`💻 Painel Master Web em: http://localhost:${CONFIG.PORT}`);
  console.log(`👑 Admin E-mail: ${CONFIG.ADMIN_EMAIL}`);
  console.log(`======================================================\n`);
});

export { app, server };
