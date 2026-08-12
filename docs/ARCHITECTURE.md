# ARCHITECTURE — inventory-online

## High-level

```text
Browser (React + TypeScript + Vite)
        |  HTTPS / JWT
        v
Render: inventory-api (ASP.NET Core .NET 10)
        |
        +------------------+------------------+
        v                  v                  v
 Supabase            Upstash Redis        Serilog
 PostgreSQL          (cache / rate limit)
 SOURCE OF TRUTH
```

Frontend **không** truy cập PostgreSQL / Supabase client trực tiếp.

## Backend layers (planned)

```text
Inventory.Api          → Controllers, middleware, Swagger
Inventory.Application  → Commands, Queries, Validators
Inventory.Domain       → Entities, enums, business exceptions
Inventory.Infrastructure → Dapper, PostgreSQL, Redis, JWT
Inventory.Shared       → Cross-cutting DTOs / constants
```

## Domain model (from legacy)

| Legacy | Online |
|--------|--------|
| categories | categories (Công Ty) |
| products + product.stock | products (stock trên cùng bảng) |
| transactions | transactions (immutable) |
| exportSlips | export_slips (items JSONB) |
| importSlips | import_slips (items JSONB) |
| — | users (login only — không RBAC) |

**Không có** warehouse, inventories, receipt/issue documents, phân quyền.

## Concurrency (multi-user)

- PostgreSQL transaction per operation
- `SELECT ... FROM products WHERE id=? FOR UPDATE` khi đổi stock
- Complete slip multi-line = single DB transaction (all-or-nothing)

## Caching (Redis)

Cache: products list pages, categories, dashboard stats.  
Do **not** cache as source of truth: products.stock, transactions, slips.

## Hosting (planned)

| Service | Platform |
|---------|----------|
| inventory-api | Render Web Service |
| inventory-web | Render Static Site |
| Database | Supabase PostgreSQL |
| Redis | Upstash |

## Legacy reference

Source: `../inventory/` — giữ nguyên cho rollback / regression compare.
