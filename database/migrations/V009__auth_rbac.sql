-- V009: Authentication & RBAC (NEW — legacy had no auth)

BEGIN;

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

CREATE TABLE roles (
    id          SMALLSERIAL  PRIMARY KEY,
    code        VARCHAR(64)  NOT NULL,
    name        VARCHAR(128) NOT NULL,
    description TEXT         NOT NULL DEFAULT '',
    CONSTRAINT uq_roles_code UNIQUE (code)
);

CREATE TABLE permissions (
    id          SMALLSERIAL  PRIMARY KEY,
    code        VARCHAR(128) NOT NULL,
    name        VARCHAR(256) NOT NULL,
    description TEXT         NOT NULL DEFAULT '',
    CONSTRAINT uq_permissions_code UNIQUE (code)
);

CREATE TABLE user_roles (
    user_id  BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id  SMALLINT    NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permissions (
    role_id       SMALLINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id SMALLINT NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Deferred FKs from business tables
ALTER TABLE stock_movements
    ADD CONSTRAINT fk_stock_movements_created_by
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE export_slips
    ADD CONSTRAINT fk_export_slips_created_by
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE export_slips
    ADD CONSTRAINT fk_export_slips_updated_by
    FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE import_slips
    ADD CONSTRAINT fk_import_slips_created_by
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE import_slips
    ADD CONSTRAINT fk_import_slips_updated_by
    FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL;

INSERT INTO schema_migrations (version, name)
VALUES ('V009', 'auth_rbac')
ON CONFLICT (version) DO NOTHING;

COMMIT;
