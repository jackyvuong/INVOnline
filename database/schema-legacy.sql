-- Schema đơn giản — bám legacy IndexedDB + users (login)
-- Dùng cho cài mới hoặc tham chiếu. DB đã chạy V001–V010: chạy thêm V011.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(32)  PRIMARY KEY,
    name        VARCHAR(256) NOT NULL,
    applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 1. categories (legacy categories[])
CREATE TABLE IF NOT EXISTS categories (
    id           BIGSERIAL    PRIMARY KEY,
    legacy_id    INTEGER      NOT NULL,
    code         VARCHAR(64)  NOT NULL,
    name         VARCHAR(256) NOT NULL,
    description  TEXT         NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by_email VARCHAR(256) NOT NULL DEFAULT '',
    updated_by_email VARCHAR(256) NOT NULL DEFAULT '',
    CONSTRAINT uq_categories_legacy_id UNIQUE (legacy_id),
    CONSTRAINT uq_categories_code UNIQUE (code),
    CONSTRAINT uq_categories_name UNIQUE (name)
);

-- 2. products (legacy products[] — stock trên cùng bảng)
CREATE TABLE IF NOT EXISTS products (
    id             BIGSERIAL     PRIMARY KEY,
    legacy_id      INTEGER       NOT NULL,
    code           VARCHAR(64)   NOT NULL,
    name           VARCHAR(512)  NOT NULL,
    category_name  VARCHAR(256)  NOT NULL DEFAULT '',
    unit           VARCHAR(32)   NOT NULL,
    brand          VARCHAR(128)  NOT NULL DEFAULT '',
    description    TEXT          NOT NULL DEFAULT '',
    note           TEXT          NOT NULL DEFAULT '',
    warning_stock  INTEGER       NOT NULL DEFAULT 0,
    stock          NUMERIC(18,4) NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by_email VARCHAR(256) NOT NULL DEFAULT '',
    updated_by_email VARCHAR(256) NOT NULL DEFAULT '',
    CONSTRAINT uq_products_legacy_id UNIQUE (legacy_id),
    CONSTRAINT uq_products_code UNIQUE (code),
    CONSTRAINT ck_products_warning_stock CHECK (warning_stock >= 0),
    CONSTRAINT ck_products_stock CHECK (stock >= 0)
);

-- 3. transactions (legacy transactions[])
CREATE TABLE IF NOT EXISTS transactions (
    id           BIGSERIAL       PRIMARY KEY,
    legacy_id    INTEGER         NOT NULL,
    movement_at  TIMESTAMPTZ     NOT NULL,
    product_id   BIGINT          NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    type         VARCHAR(16)     NOT NULL,
    quantity     NUMERIC(18, 4)  NOT NULL,
    note         TEXT            NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by_email VARCHAR(256) NOT NULL DEFAULT '',
    CONSTRAINT uq_transactions_legacy_id UNIQUE (legacy_id),
    CONSTRAINT ck_transactions_type CHECK (type IN ('IN', 'OUT', 'ADJUST')),
    CONSTRAINT ck_transactions_in_out_qty CHECK (type NOT IN ('IN', 'OUT') OR quantity > 0),
    CONSTRAINT ck_transactions_adjust_qty CHECK (type <> 'ADJUST' OR quantity <> 0)
);

-- 4. export_slips (legacy exportSlips[] — items JSONB)
CREATE TABLE IF NOT EXISTS export_slips (
    id                     BIGSERIAL    PRIMARY KEY,
    legacy_id              INTEGER      NOT NULL,
    code                   VARCHAR(32)  NOT NULL,
    slip_date              TIMESTAMPTZ  NOT NULL,
    recipient              VARCHAR(256) NOT NULL DEFAULT '',
    note                   TEXT         NOT NULL DEFAULT '',
    status                 VARCHAR(16)  NOT NULL DEFAULT 'PROCESSING',
    items                  JSONB        NOT NULL DEFAULT '[]'::jsonb,
    out_transaction_ids    JSONB        NOT NULL DEFAULT '[]'::jsonb,
    return_transaction_ids JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by_email       VARCHAR(256) NOT NULL DEFAULT '',
    updated_by_email       VARCHAR(256) NOT NULL DEFAULT '',
    CONSTRAINT uq_export_slips_legacy_id UNIQUE (legacy_id),
    CONSTRAINT uq_export_slips_code UNIQUE (code),
    CONSTRAINT ck_export_slips_status CHECK (status IN ('PROCESSING', 'COMPLETED', 'RETURNED'))
);

-- 5. import_slips (legacy importSlips[])
CREATE TABLE IF NOT EXISTS import_slips (
    id                     BIGSERIAL    PRIMARY KEY,
    legacy_id              INTEGER      NOT NULL,
    code                   VARCHAR(32)  NOT NULL,
    slip_date              TIMESTAMPTZ  NOT NULL,
    supplier               VARCHAR(256) NOT NULL DEFAULT '',
    note                   TEXT         NOT NULL DEFAULT '',
    status                 VARCHAR(16)  NOT NULL DEFAULT 'PROCESSING',
    items                  JSONB        NOT NULL DEFAULT '[]'::jsonb,
    in_transaction_ids     JSONB        NOT NULL DEFAULT '[]'::jsonb,
    return_transaction_ids JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by_email       VARCHAR(256) NOT NULL DEFAULT '',
    updated_by_email       VARCHAR(256) NOT NULL DEFAULT '',
    CONSTRAINT uq_import_slips_legacy_id UNIQUE (legacy_id),
    CONSTRAINT uq_import_slips_code UNIQUE (code),
    CONSTRAINT ck_import_slips_status CHECK (status IN ('PROCESSING', 'COMPLETED', 'RETURNED'))
);

-- 6. users — Google login (không RBAC)
CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL    PRIMARY KEY,
    google_sub      VARCHAR(256) NOT NULL,
    email           VARCHAR(256) NOT NULL,
    display_name    VARCHAR(128) NOT NULL DEFAULT '',
    avatar_url      TEXT         NOT NULL DEFAULT '',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_google_sub UNIQUE (google_sub),
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS ix_products_code ON products (code);
CREATE INDEX IF NOT EXISTS ix_products_category_name ON products (category_name);
CREATE INDEX IF NOT EXISTS ix_transactions_product_id ON transactions (product_id);
CREATE INDEX IF NOT EXISTS ix_transactions_movement_at ON transactions (movement_at);
CREATE INDEX IF NOT EXISTS ix_export_slips_code ON export_slips (code);
CREATE INDEX IF NOT EXISTS ix_import_slips_code ON import_slips (code);

COMMIT;
