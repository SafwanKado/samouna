-- Samouna multi-tenant schema. Idempotent: safe to run on every deploy.

CREATE TABLE IF NOT EXISTS users (
  user_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name          TEXT NOT NULL,
  phone_number       TEXT NOT NULL UNIQUE CHECK (phone_number ~ '^\+9647[0-9]{9}$'),
  role               TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'bakery_owner')),
  preferred_language TEXT NOT NULL DEFAULT 'ku' CHECK (preferred_language IN ('ku', 'ar', 'en')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  store_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id         BIGINT NOT NULL REFERENCES users(user_id),
  store_name       TEXT NOT NULL,
  address          TEXT NOT NULL,
  city             TEXT NOT NULL CHECK (city IN ('duhok', 'sharya')),
  delivery_fee_iqd INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_iqd >= 0),
  is_active        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS stores_owner_uniq ON stores(owner_id);
CREATE INDEX IF NOT EXISTS stores_city_idx ON stores(city);

CREATE TABLE IF NOT EXISTS products (
  product_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id     BIGINT NOT NULL REFERENCES stores(store_id),
  name_ku      TEXT NOT NULL,
  name_ar      TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  price        INTEGER NOT NULL CHECK (price > 0), -- IQD
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_store_idx ON products(store_id, sort_order);

CREATE TABLE IF NOT EXISTS orders (
  order_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id         BIGINT NOT NULL REFERENCES users(user_id),
  store_id            BIGINT NOT NULL REFERENCES stores(store_id),
  client_request_id   TEXT,               -- idempotency key from the PWA
  customer_name       TEXT NOT NULL,      -- snapshot at order time
  customer_phone      TEXT NOT NULL,
  delivery_address    TEXT NOT NULL,
  delivery_city       TEXT NOT NULL CHECK (delivery_city IN ('duhok', 'sharya')),
  notes               TEXT,
  subtotal_amount     INTEGER NOT NULL CHECK (subtotal_amount >= 0),
  delivery_fee        INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total_amount        INTEGER NOT NULL CHECK (total_amount >= 0),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
                        ('pending', 'in_oven', 'ready', 'out_for_delivery', 'completed', 'cancelled')),
  cancellation_reason TEXT,
  cancelled_by        TEXT CHECK (cancelled_by IN ('customer', 'bakery')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at         TIMESTAMPTZ,
  ready_at            TIMESTAMPTZ,
  out_for_delivery_at TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_uniq ON orders(customer_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_store_created_idx ON orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_created_idx ON orders(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  order_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id      BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  product_id    BIGINT NOT NULL REFERENCES products(product_id),
  quantity      INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  price         INTEGER NOT NULL CHECK (price > 0)  -- unit price snapshot, IQD
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id       BIGINT NOT NULL UNIQUE REFERENCES orders(order_id),
  store_id       BIGINT NOT NULL REFERENCES stores(store_id),
  amount         INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash_on_delivery' CHECK (payment_method IN ('cash_on_delivery')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_store_created_idx ON transactions(store_id, created_at);

-- Supporting table for WhatsApp OTP (codes are stored hashed, never in plain text).
CREATE TABLE IF NOT EXISTS otp_codes (
  otp_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone_number TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_codes_phone_idx ON otp_codes(phone_number, created_at DESC);

-- Every order that reaches `completed` is logged to `transactions` automatically,
-- in the same database transaction, whichever code path completed it.
CREATE OR REPLACE FUNCTION log_completed_order() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO transactions (order_id, store_id, amount, payment_method)
    VALUES (NEW.order_id, NEW.store_id, NEW.total_amount, 'cash_on_delivery')
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_log_completed ON orders;
CREATE TRIGGER orders_log_completed
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION log_completed_order();
