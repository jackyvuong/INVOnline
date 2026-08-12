-- V008: Import slips (legacy importSlips[] — Phiếu nhập kho)

BEGIN;

CREATE TABLE import_slips (
    id            BIGSERIAL    PRIMARY KEY,
    legacy_id     INTEGER      NOT NULL,
    code          VARCHAR(32)  NOT NULL,
    slip_date     TIMESTAMPTZ  NOT NULL,
    supplier      VARCHAR(256) NOT NULL DEFAULT '',
    note          TEXT         NOT NULL DEFAULT '',
    status        VARCHAR(16)  NOT NULL DEFAULT 'PROCESSING',
    completed_at  TIMESTAMPTZ,
    returned_at   TIMESTAMPTZ,
    created_by    BIGINT,
    updated_by    BIGINT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_import_slips_legacy_id UNIQUE (legacy_id),
    CONSTRAINT uq_import_slips_code UNIQUE (code),
    CONSTRAINT ck_import_slips_status CHECK (status IN ('PROCESSING', 'COMPLETED', 'RETURNED'))
);

CREATE INDEX ix_import_slips_code ON import_slips (code);
CREATE INDEX ix_import_slips_status ON import_slips (status);
CREATE INDEX ix_import_slips_slip_date ON import_slips (slip_date);

CREATE TABLE import_slip_items (
    id              BIGSERIAL       PRIMARY KEY,
    import_slip_id  BIGINT          NOT NULL REFERENCES import_slips (id) ON DELETE CASCADE,
    product_id      BIGINT          NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    line_no         INTEGER         NOT NULL,
    quantity        NUMERIC(18, 4)  NOT NULL,
    note            TEXT            NOT NULL DEFAULT '',
    CONSTRAINT ck_import_slip_items_quantity CHECK (quantity > 0),
    CONSTRAINT uq_import_slip_items_line UNIQUE (import_slip_id, line_no),
    CONSTRAINT uq_import_slip_items_product UNIQUE (import_slip_id, product_id)
);

CREATE INDEX ix_import_slip_items_slip_id ON import_slip_items (import_slip_id);
CREATE INDEX ix_import_slip_items_product_id ON import_slip_items (product_id);

INSERT INTO schema_migrations (version, name)
VALUES ('V008', 'import_slips')
ON CONFLICT (version) DO NOTHING;

COMMIT;
