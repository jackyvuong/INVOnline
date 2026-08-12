-- V011: Simplify schema — bám 5 entity legacy + users (login only)
-- Drops: warehouses, inventories, RBAC, audit_logs, slip line tables, stock_movements
-- Adds: transactions, stock on products, JSONB items on slips

BEGIN;

-- --- Drop tables không dùng ---
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS export_slip_items CASCADE;
DROP TABLE IF EXISTS import_slip_items CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS inventories CASCADE;
DROP TABLE IF EXISTS warehouses CASCADE;

-- --- users: chỉ login, không phân quyền ---
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id              BIGSERIAL    PRIMARY KEY,
    email           VARCHAR(256) NOT NULL,
    password_hash   VARCHAR(512) NOT NULL,
    display_name    VARCHAR(128) NOT NULL DEFAULT '',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_email UNIQUE (email)
);

-- --- products: thêm stock như legacy (bỏ category_id) ---
ALTER TABLE products DROP COLUMN IF EXISTS category_id;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock NUMERIC(18, 4) NOT NULL DEFAULT 0;
ALTER TABLE products DROP CONSTRAINT IF EXISTS ck_products_stock;
ALTER TABLE products ADD CONSTRAINT ck_products_stock CHECK (stock >= 0);

DROP INDEX IF EXISTS ix_products_category_id;

-- --- transactions (legacy transactions[]) ---
CREATE TABLE transactions (
    id           BIGSERIAL       PRIMARY KEY,
    legacy_id    INTEGER         NOT NULL,
    movement_at  TIMESTAMPTZ     NOT NULL,
    product_id   BIGINT          NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    type         VARCHAR(16)     NOT NULL,
    quantity     NUMERIC(18, 4)  NOT NULL,
    note         TEXT            NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_transactions_legacy_id UNIQUE (legacy_id),
    CONSTRAINT ck_transactions_type CHECK (type IN ('IN', 'OUT', 'ADJUST')),
    CONSTRAINT ck_transactions_in_out_qty CHECK (type NOT IN ('IN', 'OUT') OR quantity > 0),
    CONSTRAINT ck_transactions_adjust_qty CHECK (type <> 'ADJUST' OR quantity <> 0)
);

CREATE INDEX ix_transactions_product_id ON transactions (product_id);
CREATE INDEX ix_transactions_movement_at ON transactions (movement_at);
CREATE INDEX ix_transactions_type ON transactions (type);

-- --- export_slips: items JSONB như legacy ---
ALTER TABLE export_slips DROP COLUMN IF EXISTS created_by;
ALTER TABLE export_slips DROP COLUMN IF EXISTS updated_by;
ALTER TABLE export_slips DROP COLUMN IF EXISTS completed_at;
ALTER TABLE export_slips DROP COLUMN IF EXISTS returned_at;
ALTER TABLE export_slips ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE export_slips ADD COLUMN IF NOT EXISTS out_transaction_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE export_slips ADD COLUMN IF NOT EXISTS return_transaction_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- --- import_slips: items JSONB như legacy ---
ALTER TABLE import_slips DROP COLUMN IF EXISTS created_by;
ALTER TABLE import_slips DROP COLUMN IF EXISTS updated_by;
ALTER TABLE import_slips DROP COLUMN IF EXISTS completed_at;
ALTER TABLE import_slips DROP COLUMN IF EXISTS returned_at;
ALTER TABLE import_slips ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE import_slips ADD COLUMN IF NOT EXISTS in_transaction_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE import_slips ADD COLUMN IF NOT EXISTS return_transaction_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO schema_migrations (version, name)
VALUES ('V011', 'simplify_legacy_model')
ON CONFLICT (version) DO NOTHING;

COMMIT;
