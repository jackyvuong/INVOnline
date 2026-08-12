-- V006: Stock movements (legacy transactions[] — immutable ledger)

BEGIN;

CREATE TABLE stock_movements (
    id               BIGSERIAL       PRIMARY KEY,
    legacy_id        INTEGER         NOT NULL,
    product_id       BIGINT          NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    warehouse_id     SMALLINT        NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
    movement_type    VARCHAR(16)     NOT NULL,
    quantity         NUMERIC(18, 4)  NOT NULL,
    quantity_before  NUMERIC(18, 4),
    quantity_after   NUMERIC(18, 4),
    movement_at      TIMESTAMPTZ     NOT NULL,
    note             TEXT            NOT NULL DEFAULT '',
    document_type    VARCHAR(32),
    document_id      BIGINT,
    created_by       BIGINT,
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_stock_movements_legacy_id UNIQUE (legacy_id),
    CONSTRAINT ck_stock_movements_type CHECK (movement_type IN ('IN', 'OUT', 'ADJUST')),
    CONSTRAINT ck_stock_movements_document_type CHECK (
        document_type IS NULL
        OR document_type IN ('MANUAL', 'EXPORT_SLIP', 'IMPORT_SLIP')
    ),
    CONSTRAINT ck_stock_movements_in_out_qty CHECK (
        movement_type NOT IN ('IN', 'OUT')
        OR quantity > 0
    ),
    CONSTRAINT ck_stock_movements_adjust_qty CHECK (
        movement_type <> 'ADJUST'
        OR quantity <> 0
    )
);

CREATE INDEX ix_stock_movements_product_id ON stock_movements (product_id);
CREATE INDEX ix_stock_movements_warehouse_id ON stock_movements (warehouse_id);
CREATE INDEX ix_stock_movements_product_warehouse ON stock_movements (product_id, warehouse_id);
CREATE INDEX ix_stock_movements_movement_at ON stock_movements (movement_at);
CREATE INDEX ix_stock_movements_document ON stock_movements (document_type, document_id);
CREATE INDEX ix_stock_movements_movement_type ON stock_movements (movement_type);

COMMENT ON TABLE stock_movements IS 'Immutable stock history. Legacy: transactions[]. No UPDATE/DELETE in application layer.';

INSERT INTO schema_migrations (version, name)
VALUES ('V006', 'stock_movements')
ON CONFLICT (version) DO NOTHING;

COMMIT;
