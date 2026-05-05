import nodemailer from 'nodemailer';
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface DailyReport {
  date: string;
  tasksCompleted: number;
  tasksPending: number;
  broadcastsReceived: number;
  learningsSaved: number;
  openIssues: number;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private pool: Pool;
  private toEmail: string;

  constructor(config: EmailConfig, pool: Pool, toEmail: string) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
    this.pool = pool;
    this.toEmail = toEmail;
  }

  async sendDailyReport(): Promise<boolean> {
    const report = await this.generateDailyReport();
    const html = this.buildHtmlReport(report);

    try {
      await this.transporter.sendMail({
        from: '"Nezha AI" <nezha@noreply.com>',
        to: this.toEmail,
        subject: `Nezha 每日报告 - ${report.date}`,
        html,
      });
      logger.info('[EmailService] Daily report sent successfully');
      return true;
    } catch (error) {
      logger.error('[EmailService] Failed to send email:', error);
      return false;
    }
  }

  async generateDailyReport(): Promise<DailyReport> {
    const today = new Date().toISOString().split('T')[0] ?? new Date().toDateString();

    const tasksResult = await this.pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND DATE(completed_at) = CURRENT_DATE) as completed,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending
      FROM tasks
    `);

    const broadcastsResult = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM project_communications
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const learningsResult = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM memory
      WHERE source = 'mcp-learn' AND DATE(created_at) = CURRENT_DATE
    `);

    const issuesResult = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM issues
      WHERE status = 'open'
    `);

    const completed = tasksResult.rows[0]?.completed;
    const pending = tasksResult.rows[0]?.pending;
    const bc = broadcastsResult.rows[0]?.count;
    const learn = learningsResult.rows[0]?.count;
    const issues = issuesResult.rows[0]?.count;

    return {
      date: today,
      tasksCompleted: parseInt((completed as string) ?? '0', 10),
      tasksPending: parseInt((pending as string) ?? '0', 10),
      broadcastsReceived: parseInt((bc as string) ?? '0', 10),
      learningsSaved: parseInt((learn as string) ?? '0', 10),
      openIssues: parseInt((issues as string) ?? '0', 10),
    };
  }

  private buildHtmlReport(report: DailyReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; text-align: center; }
    .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
    .stat { background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-number { font-size: 32px; font-weight: bold; color: #667eea; }
    .stat-label { color: #666; font-size: 14px; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🐉 Nezha 每日报告</h1>
      <p>${report.date}</p>
    </div>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-number">${report.tasksCompleted}</div>
        <div class="stat-label">完成任务</div>
      </div>
      <div class="stat">
        <div class="stat-number">${report.tasksPending}</div>
        <div class="stat-label">待处理任务</div>
      </div>
      <div class="stat">
        <div class="stat-number">${report.learningsSaved}</div>
        <div class="stat-label">新学习</div>
      </div>
      <div class="stat">
        <div class="stat-number">${report.openIssues}</div>
        <div class="stat-label">开放 Issues</div>
      </div>
    </div>

    <div class="footer">
      <p>由 Nezha AI 自动生成</p>
    </div>
  </div>
</body>
</html>
    `;
  }
}
