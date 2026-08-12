-- V007: Export slips (legacy exportSlips[] — Phiếu xuất kho)

BEGIN;

CREATE TABLE export_slips (
    id            BIGSERIAL    PRIMARY KEY,
    legacy_id     INTEGER      NOT NULL,
    code          VARCHAR(32)  NOT NULL,
    slip_date     TIMESTAMPTZ  NOT NULL,
    recipient     VARCHAR(256) NOT NULL DEFAULT '',
    note          TEXT         NOT NULL DEFAULT '',
    status        VARCHAR(16)  NOT NULL DEFAULT 'PROCESSING',
    completed_at  TIMESTAMPTZ,
    returned_at   TIMESTAMPTZ,
    created_by    BIGINT,
    updated_by    BIGINT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_export_slips_legacy_id UNIQUE (legacy_id),
    CONSTRAINT uq_export_slips_code UNIQUE (code),
    CONSTRAINT ck_export_slips_status CHECK (status IN ('PROCESSING', 'COMPLETED', 'RETURNED'))
);

CREATE INDEX ix_export_slips_code ON export_slips (code);
CREATE INDEX ix_export_slips_status ON export_slips (status);
CREATE INDEX ix_export_slips_slip_date ON export_slips (slip_date);

CREATE TABLE export_slip_items (
    id              BIGSERIAL       PRIMARY KEY,
    export_slip_id  BIGINT          NOT NULL REFERENCES export_slips (id) ON DELETE CASCADE,
    product_id      BIGINT          NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    line_no         INTEGER         NOT NULL,
    quantity        NUMERIC(18, 4)  NOT NULL,
    note            TEXT            NOT NULL DEFAULT '',
    CONSTRAINT ck_export_slip_items_quantity CHECK (quantity > 0),
    CONSTRAINT uq_export_slip_items_line UNIQUE (export_slip_id, line_no),
    CONSTRAINT uq_export_slip_items_product UNIQUE (export_slip_id, product_id)
);

CREATE INDEX ix_export_slip_items_slip_id ON export_slip_items (export_slip_id);
CREATE INDEX ix_export_slip_items_product_id ON export_slip_items (product_id);

INSERT INTO schema_migrations (version, name)
VALUES ('V007', 'export_slips')
ON CONFLICT (version) DO NOTHING;

COMMIT;
