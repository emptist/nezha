import 'dotenv/config';
import { Pool } from 'pg';
import { EmailService } from './src/services/EmailService.js';

const pool = new Pool({
  host: process.env.NEZHA_DB_HOST || 'localhost',
  port: parseInt(process.env.NEZHA_DB_PORT || '5432'),
  database: process.env.NEZHA_DB_NAME || 'nezha',
  user: process.env.NEZHA_DB_USER || 'postgres',
  password: process.env.NEZHA_DB_PASSWORD || 'postgres',
});

const emailService = new EmailService(
  {
    host: process.env.SMTP_HOST || 'smtp.163.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '13318754991@163.com',
      pass: process.env.SMTP_PASS || '',
    },
  },
  pool,
  process.env.SMTP_TO || '13318754991@163.com'
);

console.log('Sending test email...');
emailService.sendDailyReport().then(success => {
  console.log('Email sent:', success ? 'SUCCESS' : 'FAILED');
  process.exit(success ? 0 : 1);
});
