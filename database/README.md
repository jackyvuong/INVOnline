# Database — PostgreSQL (Supabase)

Schema **bám legacy IndexedDB** — **6 bảng dữ liệu + 1 bảng login**.

## Bảng nghiệp vụ (giống legacy)

| Bảng | Legacy |
|------|--------|
| `categories` | `categories[]` — Công Ty |
| `products` | `products[]` — có cột `stock` |
| `transactions` | `transactions[]` — IN/OUT/ADJUST |
| `export_slips` | `exportSlips[]` — `items` JSONB |
| `import_slips` | `importSlips[]` — `items` JSONB |
| **`users`** | **Mới** — email + password (login) |

Meta: `schema_migrations`

**Không có:** warehouses, inventories, RBAC, audit_logs, bảng dòng phiếu riêng.

## Cài mới (Supabase trống)

```powershell
$env:DATABASE_URL = "postgresql://postgres.PROJECT:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
node run-migrations.js
```

Hoặc SQL Editor: chạy `schema-legacy.sql`.

## DB đã chạy schema cũ (V001–V010)

Chạy thêm:

```powershell
psql $DATABASE_URL -f migrations/V011__simplify_legacy_model.sql
```

Hoặc:

```powershell
node -e "
const {Client}=require('pg');const fs=require('fs');
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await c.connect();
  await c.query(fs.readFileSync('migrations/V011__simplify_legacy_model.sql','utf8'));
  await c.end();
  console.log('V011 OK');
})();
"
```

## Kiểm tra

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

Kỳ vọng: `categories`, `export_slips`, `import_slips`, `products`, `schema_migrations`, `transactions`, `users`.

## Thêm user được phép login

Admin thêm email vào bảng `users` **trước** khi user đăng nhập Google:

```sql
INSERT INTO users (google_sub, email, display_name, is_active)
VALUES ('your@gmail.com', 'your@gmail.com', 'Tên hiển thị', true);
```

(`google_sub` tạm = email; lần login Google đầu tiên sẽ cập nhật thành Google ID thật.)

## Import dữ liệu legacy (lần đầu chuyển hệ thống)

File nguồn: export từ app cũ `inventory/` (Cài đặt → Export JSON) hoặc `inventory/Database/latest.json`.

### Cách 1 — Qua giao diện (khuyên dùng)

1. Deploy API + FE, đăng nhập admin.
2. Vào **Cài đặt** → **Chọn file JSON legacy** → xác nhận import.
3. Hệ thống ghi đè categories, products, transactions, phiếu xuất/nhập.

### Cách 2 — CLI (trước khi có FE / script một lần)

```powershell
cd inventoryonline/database
$env:DATABASE_URL = "postgresql://postgres.PROJECT:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
node import-legacy.js --file ../../inventory/Database/latest.json --dry-run
node import-legacy.js --file ../../inventory/Database/latest.json --email admin@example.com
```

`--dry-run` chỉ kiểm tra file, không ghi DB.

Xem thêm [docs/MIGRATION.md](../docs/MIGRATION.md).
