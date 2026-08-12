# QuanLyTonKho — Online

React + ASP.NET Core + PostgreSQL (Supabase). Bám đúng 9 màn hình legacy + login Google.

## Cấu trúc

```
inventory-online/
  api/          ASP.NET Core 10 Web API
  web/          React + Vite + TypeScript
  database/     PostgreSQL migrations
  docs/
```

## Yêu cầu

- .NET 10 SDK
- Node.js 20+
- Supabase PostgreSQL
- Google OAuth Client ID (Web)

## Cấu hình Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Tạo **OAuth 2.0 Client ID** (Web application)
3. Authorized JavaScript origins: `http://localhost:5173`
4. Copy Client ID vào:
   - `web/.env` → `VITE_GOOGLE_CLIENT_ID`
   - `api/appsettings.Development.json` → `Google:ClientId`

## Chạy local

### Database

Đã có Supabase → chạy migrations V001–V012 (xem `database/README.md`).

### Backend

```powershell
cd api
$env:ConnectionStrings__Default = "Host=...;Password=...;SSL Mode=Require;Trust Server Certificate=true"
$env:Jwt__Secret = "your-secret-min-32-characters-long-here"
$env:Google__ClientId = "xxx.apps.googleusercontent.com"
dotnet run
```

API: http://localhost:5000

### Frontend

```powershell
cd web
copy .env.example .env
# Sửa VITE_GOOGLE_CLIENT_ID và VITE_API_BASE_URL
npm install
npm run dev
```

Web: http://localhost:5173 → trang login Google → vào app.

## Tính năng (giống legacy)

| Màn hình | Route |
|----------|-------|
| Dashboard | `/` |
| Công Ty | `/categories` |
| Quản lý sản phẩm | `/products` |
| Biến động tồn kho | `/transactions` |
| Phiếu xuất kho | `/export-slips` |
| Phiếu nhập kho | `/import-slips` |
| Tồn hiện tại | `/stock` |
| Báo cáo tồn kho | `/report` |
| Cài đặt | `/settings` |

## Audit email

Mọi thao tác **thêm / sửa / xóa** ghi `created_by_email` / `updated_by_email` (và `created_by_email` trên giao dịch mới) trong PostgreSQL.

## Auth

- Login Google → JWT (8h)
- Không phân quyền — login được = full app
