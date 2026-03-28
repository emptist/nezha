import crypto from 'crypto';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';
import { logger } from '../utils/logger.js';

export interface Payment {
  id: string;
  user_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  payment_method: string;
  description: string | null;
  metadata: Record<string, unknown>;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_customer_id: string | null;
  refunded_amount_cents: number;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  failed_at: Date | null;
}

export interface PaymentInput {
  user_id?: string;
  amount_cents: number;
  currency?: string;
  payment_method: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentIntentResult {
  clientSecret: string;
  paymentId: string;
}

export interface RefundInput {
  paymentId: string;
  amount_cents: number;
  reason?: string;
}

interface StripeConfig {
  secretKey?: string;
  webhookSecret?: string;
  publishableKey?: string;
}

export class PaymentService {
  private db: DatabaseClient;
  private stripeConfig: StripeConfig | undefined;
  private stripe: any;

  constructor(db: DatabaseClient) {
    this.db = db;
    const config = Config.getInstance().getPaymentConfig();
    this.stripeConfig = config?.stripe;
  }

  static async create(db: DatabaseClient): Promise<PaymentService> {
    return new PaymentService(db);
  }

  private getStripe(): Promise<any> {
    if (!this.stripe) {
      if (!this.stripeConfig?.secretKey) {
        throw new Error('Stripe is not configured');
      }
      return import('stripe').then(m => {
        this.stripe = m.default(this.stripeConfig!.secretKey);
        return this.stripe;
      });
    }
    return Promise.resolve(this.stripe);
  }

  isStripeConfigured(): boolean {
    return !!this.stripeConfig?.secretKey;
  }

  async createPayment(input: PaymentInput): Promise<Payment> {
    const result = await this.db.query<Payment>(
      `INSERT INTO payments (user_id, amount_cents, currency, payment_method, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.user_id || null,
        input.amount_cents,
        input.currency || 'USD',
        input.payment_method,
        input.description || null,
        JSON.stringify(input.metadata || {}),
      ]
    );
    return result.rows[0]!;
  }

  async getPayment(paymentId: string): Promise<Payment | null> {
    const result = await this.db.query<Payment>(`SELECT * FROM payments WHERE id = $1`, [
      paymentId,
    ]);
    return result.rows[0] || null;
  }

  async getPaymentByStripeIntent(stripePaymentIntentId: string): Promise<Payment | null> {
    const result = await this.db.query<Payment>(
      `SELECT * FROM payments WHERE stripe_payment_intent_id = $1`,
      [stripePaymentIntentId]
    );
    return result.rows[0] || null;
  }

  async updatePaymentStatus(
    paymentId: string,
    status: string,
    additionalFields?: Record<string, unknown>
  ): Promise<Payment> {
    const updates: string[] = ['status = $1', 'updated_at = NOW()'];
    const values: unknown[] = [status];
    let idx = 2;

    if (additionalFields) {
      for (const [key, value] of Object.entries(additionalFields)) {
        updates.push(`${key} = $${idx++}`);
        values.push(value);
      }
    }

    values.push(paymentId);

    const result = await this.db.query<Payment>(
      `UPDATE payments SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0]!;
  }

  async createPaymentIntent(input: PaymentInput): Promise<CreatePaymentIntentResult> {
    const stripe = await this.getStripe();

    const payment = await this.createPayment({
      ...input,
      payment_method: 'stripe_card',
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: input.amount_cents,
      currency: input.currency?.toLowerCase() || 'usd',
      metadata: {
        payment_id: payment.id,
        ...(input.user_id && { user_id: input.user_id }),
      },
    });

    await this.db.query(`UPDATE payments SET stripe_payment_intent_id = $1 WHERE id = $2`, [
      paymentIntent.id,
      payment.id,
    ]);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentId: payment.id,
    };
  }

  async confirmPayment(paymentIntentId: string): Promise<Payment | null> {
    const payment = await this.getPaymentByStripeIntent(paymentIntentId);
    if (!payment) return null;

    return this.updatePaymentStatus(payment.id, 'succeeded', {
      completed_at: new Date(),
    });
  }

  async handlePaymentFailed(paymentIntentId: string, reason?: string): Promise<Payment | null> {
    const payment = await this.getPaymentByStripeIntent(paymentIntentId);
    if (!payment) return null;

    return this.updatePaymentStatus(payment.id, 'failed', {
      failed_at: new Date(),
      failed_reason: reason || 'Payment failed',
    });
  }

  async createRefund(input: RefundInput, processedBy?: string): Promise<any> {
    const payment = await this.getPayment(input.paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    if (payment.status !== 'succeeded') {
      throw new Error('Can only refund successful payments');
    }

    const refundAmount = input.amount_cents || payment.amount_cents - payment.refunded_amount_cents;

    if (refundAmount > payment.amount_cents - payment.refunded_amount_cents) {
      throw new Error('Refund amount exceeds remaining refundable amount');
    }

    const result = await this.db.query<any>(
      `INSERT INTO payment_refunds (payment_id, amount_cents, reason, processed_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.paymentId, refundAmount, input.reason || null, processedBy || null]
    );

    const refund = result.rows[0]!;

    if (this.isStripeConfigured() && payment.stripe_payment_intent_id) {
      try {
        const stripe = await this.getStripe();
        const stripeRefund = await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent_id,
          amount: refundAmount,
        });

        await this.db.query(
          `UPDATE payment_refunds SET stripe_refund_id = $1, status = 'succeeded', processed_at = NOW() WHERE id = $2`,
          [stripeRefund.id, refund.id]
        );

        await this.updatePaymentStatus(
          input.paymentId,
          refundAmount >= payment.amount_cents ? 'refunded' : 'partially_refunded',
          {
            refunded_amount_cents: payment.refunded_amount_cents + refundAmount,
            refunded_at: new Date(),
          }
        );
      } catch (error) {
        await this.db.query(
          `UPDATE payment_refunds SET status = 'failed', failed_at = NOW(), failure_reason = $1 WHERE id = $2`,
          [String(error), refund.id]
        );
        throw error;
      }
    }

    return refund;
  }

  async getUserPayments(userId: string, limit = 20): Promise<Payment[]> {
    const result = await this.db.query<Payment>(
      `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }

  async getPaymentHistory(
    filters?: {
      userId?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limit = 50,
    offset = 0
  ): Promise<Payment[]> {
    let sql = 'SELECT * FROM payments WHERE 1=1';
    const values: unknown[] = [];
    let idx = 1;

    if (filters?.userId) {
      sql += ` AND user_id = $${idx++}`;
      values.push(filters.userId);
    }

    if (filters?.status) {
      sql += ` AND status = $${idx++}`;
      values.push(filters.status);
    }

    if (filters?.startDate) {
      sql += ` AND created_at >= $${idx++}`;
      values.push(filters.startDate);
    }

    if (filters?.endDate) {
      sql += ` AND created_at <= $${idx++}`;
      values.push(filters.endDate);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
    values.push(limit, offset);

    const result = await this.db.query<Payment>(sql, values);
    return result.rows;
  }

  async handleWebhook(
    payload: string,
    signature: string
  ): Promise<{ processed: boolean; event?: any; error?: string }> {
    if (!this.stripeConfig?.webhookSecret) {
      return { processed: false, error: 'Webhook secret not configured' };
    }

    try {
      const stripe = await this.getStripe();
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        this.stripeConfig.webhookSecret
      );

      const existingEvent = await this.db.query<{ id: string }>(
        `SELECT id FROM payment_webhooks WHERE event_id = $1`,
        [event.id]
      );

      if (existingEvent.rows.length > 0) {
        return { processed: false, error: 'Event already processed' };
      }

      await this.db.query(
        `INSERT INTO payment_webhooks (provider, event_type, event_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['stripe', event.type, event.id, JSON.stringify(event.data.object)]
      );

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(
            event.data.object.id,
            event.data.object.last_payment_error?.message
          );
          break;
        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object);
          break;
      }

      await this.db.query(
        `UPDATE payment_webhooks SET processed = true, processed_at = NOW() WHERE event_id = $1`,
        [event.id]
      );

      return { processed: true, event };
    } catch (error) {
      logger.error('[PaymentService] Webhook error:', error);
      return { processed: false, error: String(error) };
    }
  }

  private async handlePaymentSucceeded(paymentIntent: any): Promise<void> {
    const payment = await this.getPaymentByStripeIntent(paymentIntent.id);
    if (payment && payment.status !== 'succeeded') {
      await this.updatePaymentStatus(payment.id, 'succeeded', {
        stripe_charge_id: paymentIntent.latest_charge,
        completed_at: new Date(),
      });
    }
  }

  private async handleChargeRefunded(charge: any): Promise<void> {
    const payment = await this.getPaymentByStripeIntent(charge.payment_intent);
    if (payment) {
      const newRefundedAmount = payment.refunded_amount_cents + (charge.amount_refunded || 0);
      const status = newRefundedAmount >= payment.amount_cents ? 'refunded' : 'partially_refunded';

      await this.updatePaymentStatus(payment.id, status, {
        refunded_amount_cents: newRefundedAmount,
        refunded_at: new Date(),
      });
    }
  }

  async getRevenueStats(startDate: Date, endDate: Date): Promise<any> {
    const result = await this.db.query<any>(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status = 'succeeded' THEN amount_cents ELSE 0 END) as total_revenue,
        SUM(CASE WHEN status = 'failed' THEN amount_cents ELSE 0 END) as failed_amount,
        SUM(CASE WHEN status IN ('refunded', 'partially_refunded') THEN refunded_amount_cents ELSE 0 END) as refunded_amount,
        COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as successful_transactions,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_transactions
       FROM payments 
       WHERE created_at >= $1 AND created_at <= $2`,
      [startDate, endDate]
    );
    return result.rows[0];
  }

  async getPaymentMethods(userId: string): Promise<any[]> {
    const result = await this.db.query<any>(
      `SELECT * FROM user_payment_methods WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async savePaymentMethod(
    userId: string,
    paymentMethodData: {
      type: string;
      stripe_payment_method_id?: string;
      stripe_card_brand?: string;
      stripe_card_last4?: string;
      stripe_card_exp_month?: number;
      stripe_card_exp_year?: number;
      nickname?: string;
    }
  ): Promise<any> {
    const existingDefault = await this.db.query<{ id: string }>(
      `SELECT id FROM user_payment_methods WHERE user_id = $1 AND is_default = true`,
      [userId]
    );

    const isDefault = existingDefault.rows.length === 0;

    const result = await this.db.query<any>(
      `INSERT INTO user_payment_methods (user_id, type, is_default, stripe_payment_method_id, stripe_card_brand, stripe_card_last4, stripe_card_exp_month, stripe_card_exp_year, nickname)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId,
        paymentMethodData.type,
        isDefault,
        paymentMethodData.stripe_payment_method_id || null,
        paymentMethodData.stripe_card_brand || null,
        paymentMethodData.stripe_card_last4 || null,
        paymentMethodData.stripe_card_exp_month || null,
        paymentMethodData.stripe_card_exp_year || null,
        paymentMethodData.nickname || null,
      ]
    );
    return result.rows[0];
  }

  async deletePaymentMethod(paymentMethodId: string, userId: string): Promise<void> {
    await this.db.query(`DELETE FROM user_payment_methods WHERE id = $1 AND user_id = $2`, [
      paymentMethodId,
      userId,
    ]);
  }
}
