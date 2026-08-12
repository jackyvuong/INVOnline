-- V005: Inventories (legacy product.stock denormalized → normalized)

BEGIN;

CREATE TABLE inventories (
    id            BIGSERIAL       PRIMARY KEY,
    product_id    BIGINT          NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    warehouse_id  SMALLINT        NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
    quantity      NUMERIC(18, 4)  NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_inventories_product_warehouse UNIQUE (product_id, warehouse_id),
    CONSTRAINT ck_inventories_quantity CHECK (quantity >= 0)
);

CREATE INDEX ix_inventories_product_warehouse
    ON inventories (product_id, warehouse_id);

CREATE INDEX ix_inventories_warehouse_id ON inventories (warehouse_id);

INSERT INTO schema_migrations (version, name)
VALUES ('V005', 'inventories')
ON CONFLICT (version) DO NOTHING;

COMMIT;
