# DATABASE MAPPING — Legacy IndexedDB → PostgreSQL

> **Nguồn legacy:** `docs/LEGACY-INDEXEDDB.md`  
> **Target:** Supabase PostgreSQL, single-tenant, ~5 users  
> **Ghi chú:** Mapping dựa trên **code thực tế**, không dùng tên giả định receipts/issues/warehouses nếu legacy không có.

---

## 1. Tổng quan mapping (đơn giản — bám legacy)

```text
Legacy JSON array          PostgreSQL table

categories[]        --->   categories
products[]          --->   products (+ stock column)
transactions[]      --->   transactions
exportSlips[]       --->   export_slips (+ items JSONB)
importSlips[]       --->   import_slips (+ items JSONB)

(chưa có)           --->   users   (login only — bảng mới duy nhất)
```

**Không dùng:** warehouses, inventories, stock_movements, export_slip_items, import_slip_items, roles, permissions, audit_logs.

---

## 2. Bảng chi tiết

### 2.1 `categories` ← `categories[]`

| Legacy field | PG column | Type | Constraints |
|---|---|---|---|
| `id` | `legacy_id` | `integer` UNIQUE NOT NULL | Giữ ID cũ |
| — | `id` | `bigserial` PK | ID nội bộ |
| `code` | `code` | `varchar(64)` | UNIQUE, NOT NULL |
| `name` | `name` | `varchar(256)` | UNIQUE, NOT NULL |
| `description` | `description` | `text` | |
| `createdAt` | `created_at` | `timestamptz` | Parse `YYYY-MM-DD HH:mm` |
| `updatedAt` | `updated_at` | `timestamptz` | |

---

### 2.2 `products` ← `products[]`

| Legacy field | PG column | Type | Constraints |
|---|---|---|---|
| `id` | `legacy_id` | `integer` UNIQUE NOT NULL | |
| `code` | `code` | `varchar(64)` | UNIQUE, NOT NULL |
| `name` | `name` | `varchar(512)` | NOT NULL |
| `category` (string) | `category_name` | `varchar(256)` | Denormalized — giống legacy |
| `unit` | `unit` | `varchar(32)` | NOT NULL |
| `brand` | `brand` | `varchar(128)` | |
| `description` | `description` | `text` | |
| `note` | `note` | `text` | |
| `warningStock` | `warning_stock` | `integer` | NOT NULL, CHECK ≥ 0 |
| `stock` | `stock` | `numeric(18,4)` | NOT NULL, CHECK ≥ 0 — **giữ trên cùng bảng** |
| `createdAt` | `created_at` | `timestamptz` | |
| `updatedAt` | `updated_at` | `timestamptz` | |

---

### 2.3 `transactions` ← `transactions[]`

| Legacy field | PG column | Type | Notes |
|---|---|---|---|
| `id` | `legacy_id` | `integer` UNIQUE NOT NULL | |
| `productId` | `product_id` | FK → products | |
| `type` | `type` | `varchar(16)` | `IN`, `OUT`, `ADJUST` |
| `quantity` | `quantity` | `numeric(18,4)` | IN/OUT > 0; ADJUST ≠ 0 |
| `date` | `movement_at` | `timestamptz` | |
| `note` | `note` | `text` | |

**Rules:** NO UPDATE, NO DELETE (giống legacy).

---

### 2.4 `export_slips` ← `exportSlips[]`

| Legacy field | PG column | Type |
|---|---|---|
| `id` | `legacy_id` | `integer` UNIQUE |
| `code` | `code` | `varchar(32)` UNIQUE |
| `date` | `slip_date` | `timestamptz` |
| `recipient` | `recipient` | `varchar(256)` |
| `note` | `note` | `text` |
| `status` | `status` | `PROCESSING` \| `COMPLETED` \| `RETURNED` |
| `items[]` | `items` | `jsonb` — embedded như legacy |
| `outTransactionIds[]` | `out_transaction_ids` | `jsonb` |
| `returnTransactionIds[]` | `return_transaction_ids` | `jsonb` |
| `createdAt` | `created_at` | `timestamptz` |
| `updatedAt` | `updated_at` | `timestamptz` |

---

### 2.5 `import_slips` ← `importSlips[]`

Tương tự export, thay `recipient` → `supplier`, `inTransactionIds` → `in_transaction_ids`.

---

### 2.6 `users` (NEW — login only)

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK | |
| `email` | `varchar(256)` UNIQUE | Login |
| `password_hash` | `varchar(512)` | bcrypt/Argon2 |
| `display_name` | `varchar(128)` | |
| `is_active` | `boolean` | |
| `last_login_at` | `timestamptz` | |

**Không có** roles, permissions, audit_logs. Login thành công = dùng full app.

---

## 3. Status mapping (KHÔNG dùng DRAFT/POSTED/CANCELLED)

| Legacy (slips) | Ý nghĩa | Backend enum đề xuất |
|---|---|---|
| `PROCESSING` | Chưa ảnh hưởng tồn | `Processing` |
| `COMPLETED` | Đã post (OUT/IN) | `Completed` |
| `RETURNED` | Đã reverse | `Returned` |

| Legacy (transactions) | Backend |
|---|---|
| Immutable row | Không status — ledger entry |

**Không map** `POSTED`/`CANCELLED` trừ khi thêm layer tương thích — xem `MIGRATION-ISSUES.md`.

---

## 4. Inventory calculation mapping

| Legacy | PostgreSQL |
|---|---|
| `product.stock` | `products.stock` (cùng bảng) |
| Sum of `stockDelta(transactions)` | Phải khớp sau import |
| Report opening/closing | Query `transactions` by date range (công thức legacy) |

---

## 5. Export JSON → tables

**Input file:** `Storage.exportAll()` hoặc `latest.json`

```json
{
  "version": "1.0.0",
  "exportedAt": "...",
  "products": [...],
  "transactions": [...],
  "categories": [...],
  "exportSlips": [...],
  "importSlips": [...]
}
```

**Import order (FK-safe):**

1. categories  
2. products (copy `stock` trực tiếp)  
3. transactions  
4. export_slips (items + transaction ID arrays JSONB)  
5. import_slips (items + transaction ID arrays JSONB)  
6. Verify `products.stock` vs sum transactions  

---

## 6. Verification queries (post-migrate)

```sql
-- Count match
SELECT 'products' AS entity, COUNT(*) FROM products;
-- compare legacy export count

-- Stock match per product
SELECT legacy_id, code, stock AS pg_stock FROM products;

-- Recompute from transactions (legacy formula)
-- SUM(CASE type WHEN 'IN' THEN qty WHEN 'OUT' THEN -qty WHEN 'ADJUST' THEN qty END)
-- MUST equal products.stock for each product
```

---

## 7. API endpoint mapping (functional, not generic REST)

| Legacy screen | API (đề xuất) |
|---|---|
| Dashboard | `GET /api/dashboard/stats`, `GET /api/transactions/recent` |
| Categories | CRUD `/api/categories` |
| Products | CRUD `/api/products` + pagination |
| Transactions | `GET /api/transactions`, `POST /api/transactions` (manual IN/OUT/ADJUST) |
| Export slips | CRUD + `POST .../complete`, `POST .../return` |
| Import slips | CRUD + `POST .../complete`, `POST .../return` |
| Stock | `GET /api/products` (cột stock) |
| Report | `GET /api/reports/stock-period?from&to` |
| Login | `POST /api/auth/login` — JWT, không phân quyền |

---

## 8. Redis cache (Upstash)

| Cacheable | Key pattern | TTL |
|---|---|---|
| Product list page | `products:page:{n}` | 5–15 min |
| Categories | `categories:all` | 15 min |
| Dashboard stats | `dashboard:stats` | 1–5 min |

**Invalidate** on: product/category mutation, any transaction, slip complete/return.

**Không cache:** stock real-time, transactions list (hoặc TTL rất ngắn).

---

## 9. Primary key strategy (chốt PHASE 1)

| Option | Pros | Cons |
|---|---|---|
| **A. `legacy_id` = PK** | API URLs giống cũ, migration đơn giản | Integer gap, lộ sequence |
| **B. bigserial PK + `legacy_id` UNIQUE** | Chuẩn PG, FK ổn | API cần map |

**Đề xuất PHASE 1:** Option **B** — `legacy_id` bắt buộc cho migration verify.

---

## 10. Type mapping

| JS legacy | PostgreSQL | C# |
|---|---|---|
| integer id | `integer` / `bigint` | `int` / `long` |
| stock, qty | `numeric(18,4)` | `decimal` |
| `YYYY-MM-DD HH:mm` | `timestamptz` | `DateTimeOffset` |
| string | `varchar` / `text` | `string` |
| boolean | `boolean` | `bool` |

**Không dùng float/double cho quantity.**

---

## 11. Files liên quan

- Schema SQL: `database/schema-legacy.sql`, migration `V011`
- Migration tool: `tools/inventory-migration/` (PHASE 11)
- Issues chưa chốt: `MIGRATION-ISSUES.md`
