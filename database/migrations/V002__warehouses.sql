-- V002: Warehouses (legacy = single implicit warehouse)

BEGIN;

CREATE TABLE warehouses (
    id          SMALLINT     PRIMARY KEY,
    code        VARCHAR(32)  NOT NULL,
    name        VARCHAR(128) NOT NULL,
    is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_warehouses_code UNIQUE (code)
);

CREATE UNIQUE INDEX uq_warehouses_default
    ON warehouses (is_default)
    WHERE is_default = TRUE;

INSERT INTO schema_migrations (version, name)
VALUES ('V002', 'warehouses')
ON CONFLICT (version) DO NOTHING;

COMMIT;
