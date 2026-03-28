-- Migration: 067_payment_system
-- Description: Complete payment system with Stripe integration, multiple payment methods, webhooks, refunds, and transaction history

-- Payment methods enum
CREATE TYPE payment_method AS ENUM ('stripe_card', 'stripe_alipay', 'stripe_wechat', 'paypal', 'manual');

-- Payment status enum
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'cancelled', 'requires_action');

-- Payment transactions table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status payment_status NOT NULL DEFAULT 'pending',
    payment_method payment_method NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Stripe specific fields
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    stripe_charge_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    stripe_payment_method_id VARCHAR(255),
    
    -- PayPal specific fields
    paypal_order_id VARCHAR(255) UNIQUE,
    paypal_capture_id VARCHAR(255) UNIQUE,
    
    -- Refund tracking
    refunded_amount_cents INTEGER DEFAULT 0 CHECK (refunded_amount_cents >= 0),
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failed_reason TEXT
);

-- Payment refunds table
CREATE TABLE IF NOT EXISTS payment_refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    reason TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    
    -- Stripe refund
    stripe_refund_id VARCHAR(255) UNIQUE,
    
    -- PayPal refund
    paypal_refund_id VARCHAR(255) UNIQUE,
    
    -- Admin who processed the refund
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT
);

-- Payment webhooks log
CREATE TABLE IF NOT EXISTS payment_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_id VARCHAR(255) UNIQUE NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    processing_error TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User payment methods (saved cards, etc)
CREATE TABLE IF NOT EXISTS user_payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type payment_method NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    
    -- Stripe
    stripe_payment_method_id VARCHAR(255) UNIQUE,
    stripe_card_brand VARCHAR(50),
    stripe_card_last4 VARCHAR(4),
    stripe_card_exp_month INTEGER,
    stripe_card_exp_year INTEGER,
    
    -- PayPal
    paypal_email VARCHAR(255),
    
    -- Metadata
    nickname TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- Subscription plans
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    interval VARCHAR(20) NOT NULL CHECK (interval IN ('day', 'week', 'month', 'year')),
    interval_count INTEGER NOT NULL DEFAULT 1,
    features JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    
    -- Stripe integration
    stripe_price_id VARCHAR(255) UNIQUE,
    stripe_product_id VARCHAR(255),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR(50) NOT NULL DEFAULT 'incomplete',
    
    -- Stripe subscription
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    stripe_current_period_start TIMESTAMPTZ,
    stripe_current_period_end TIMESTAMPTZ,
    stripe_cancel_at_period_end BOOLEAN DEFAULT FALSE,
    
    -- PayPal subscription
    paypal_subscription_id VARCHAR(255) UNIQUE,
    
    -- Trial period
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    
    -- Cancellation
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

-- Payment analytics (materialized view for fast reporting)
CREATE TABLE IF NOT EXISTS payment_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_type VARCHAR(20) NOT NULL,
    
    -- Revenue metrics
    total_revenue_cents BIGINT DEFAULT 0,
    refunded_amount_cents BIGINT DEFAULT 0,
    net_revenue_cents BIGINT DEFAULT 0,
    
    -- Transaction counts
    total_transactions INTEGER DEFAULT 0,
    successful_transactions INTEGER DEFAULT 0,
    failed_transactions INTEGER DEFAULT 0,
    refunded_transactions INTEGER DEFAULT 0,
    
    -- By payment method
    revenue_by_method JSONB DEFAULT '{}',
    transactions_by_method JSONB DEFAULT '{}',
    
    -- By currency
    revenue_by_currency JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(period_start, period_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent_id ON payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_charge_id ON payments(stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_user_id_created ON payments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment_id ON payment_refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_stripe_refund_id ON payment_refunds(stripe_refund_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_created_at ON payment_refunds(created_at);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_provider ON payment_webhooks(provider);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_event_id ON payment_webhooks(event_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_processed ON payment_webhooks(processed, created_at);

CREATE INDEX IF NOT EXISTS idx_user_payment_methods_user_id ON user_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_stripe_payment_method_id ON user_payment_methods(stripe_payment_method_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active, sort_order);

-- Function to update payment status with audit trail
CREATE OR REPLACE FUNCTION update_payment_status()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    IF NEW.status = 'succeeded' AND OLD.status != 'succeeded' THEN
        NEW.completed_at = NOW();
    END IF;
    
    IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
        NEW.failed_at = NOW();
    END IF;
    
    IF NEW.status = 'refunded' AND OLD.status != 'refunded' THEN
        NEW.refunded_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_payment_status
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_status();

-- Function to prevent double refund
CREATE OR REPLACE FUNCTION check_refund_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_refunded INTEGER;
    total_amount INTEGER;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT amount_cents, COALESCE(refunded_amount_cents, 0) 
        INTO total_amount, current_refunded
        FROM payments WHERE id = NEW.payment_id;
        
        IF current_refunded + NEW.amount_cents > total_amount THEN
            RAISE EXCEPTION 'Refund amount exceeds payment amount';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_refund_limit
    BEFORE INSERT ON payment_refunds
    FOR EACH ROW
    EXECUTE FUNCTION check_refund_limit();

-- Function to update subscription status
CREATE OR REPLACE FUNCTION update_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_subscription_status
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_status();

-- Insert default subscription plans
INSERT INTO subscription_plans (name, description, price_cents, interval, interval_count, features, is_active, is_featured, sort_order) VALUES
    ('Free', 'Basic features for testing', 0, 'month', 1, 
     '["Basic API access", "100 requests/day", "Community support"]', true, false, 0),
    ('Pro', 'Professional plan with more features', 2900, 'month', 1, 
     '["Unlimited API access", "Priority support", "Advanced analytics", "Custom webhooks"]', true, true, 1),
    ('Enterprise', 'Custom solutions for large teams', 9900, 'month', 1, 
     '["Dedicated support", "SLA guarantee", "Custom integrations", "Volume discounts"]', true, false, 2)
ON CONFLICT DO NOTHING;
