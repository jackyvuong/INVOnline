-- V003: Categories (legacy UI: Công Ty)

BEGIN;

CREATE TABLE categories (
    id           BIGSERIAL    PRIMARY KEY,
    legacy_id    INTEGER      NOT NULL,
    code         VARCHAR(64)  NOT NULL,
    name         VARCHAR(256) NOT NULL,
    description  TEXT         NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_categories_legacy_id UNIQUE (legacy_id),
    CONSTRAINT uq_categories_code UNIQUE (code),
    CONSTRAINT uq_categories_name UNIQUE (name)
);

CREATE INDEX ix_categories_code ON categories (code);
CREATE INDEX ix_categories_name ON categories (name);

INSERT INTO schema_migrations (version, name)
VALUES ('V003', 'categories')
ON CONFLICT (version) DO NOTHING;

COMMIT;
