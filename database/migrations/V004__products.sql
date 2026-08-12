-- V004: Products

BEGIN;

CREATE TABLE products (
    id             BIGSERIAL     PRIMARY KEY,
    legacy_id      INTEGER       NOT NULL,
    code           VARCHAR(64)   NOT NULL,
    name           VARCHAR(512)  NOT NULL,
    category_id    BIGINT        REFERENCES categories (id) ON DELETE RESTRICT,
    category_name  VARCHAR(256)  NOT NULL DEFAULT '',
    unit           VARCHAR(32)   NOT NULL,
    brand          VARCHAR(128)  NOT NULL DEFAULT '',
    description    TEXT          NOT NULL DEFAULT '',
    note           TEXT          NOT NULL DEFAULT '',
    warning_stock  INTEGER       NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_products_legacy_id UNIQUE (legacy_id),
    CONSTRAINT uq_products_code UNIQUE (code),
    CONSTRAINT ck_products_warning_stock CHECK (warning_stock >= 0)
);

CREATE INDEX ix_products_code ON products (code);
CREATE INDEX ix_products_category_id ON products (category_id);
CREATE INDEX ix_products_category_name ON products (category_name);
CREATE INDEX ix_products_brand ON products (brand);

INSERT INTO schema_migrations (version, name)
VALUES ('V004', 'products')
ON CONFLICT (version) DO NOTHING;

COMMIT;
