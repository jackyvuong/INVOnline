namespace Inventory.Api.Services;

using System.Net.Mail;
using Dapper;
using Inventory.Api.Data;
using Inventory.Api.Models;

public class UserService(DbConnectionFactory db)
{
    public async Task<IEnumerable<User>> GetAllAsync()
    {
        await using var conn = db.Create();
        return await conn.QueryAsync<User>(
            @"SELECT id AS Id, google_sub AS GoogleSub, email AS Email, display_name AS DisplayName,
              avatar_url AS AvatarUrl, is_active AS IsActive, last_login_at AS LastLoginAt
              FROM users ORDER BY email");
    }

    public async Task<User?> GetByIdAsync(long id)
    {
        await using var conn = db.Create();
        return await conn.QuerySingleOrDefaultAsync<User>(
            @"SELECT id AS Id, google_sub AS GoogleSub, email AS Email, display_name AS DisplayName,
              avatar_url AS AvatarUrl, is_active AS IsActive, last_login_at AS LastLoginAt
              FROM users WHERE id = @Id",
            new { Id = id });
    }

    public async Task<ServiceResult<User>> CreateAsync(string email, string displayName)
    {
        email = email.Trim();
        displayName = string.IsNullOrWhiteSpace(displayName) ? email : displayName.Trim();

        var errors = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(email))
            errors["email"] = "Email là bắt buộc.";
        else if (!MailAddress.TryCreate(email, out _))
            errors["email"] = "Email không hợp lệ.";

        if (errors.Count > 0)
            return ServiceResult<User>.Fail(errors);

        await using var conn = db.Create();
        var exists = await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM users WHERE LOWER(email) = LOWER(@Email)",
            new { Email = email });
        if (exists > 0)
            return ServiceResult<User>.Fail("Email đã tồn tại trong hệ thống.");

        var id = await conn.QuerySingleAsync<long>(
            @"INSERT INTO users (google_sub, email, display_name, is_active)
              VALUES (@GoogleSub, @Email, @DisplayName, true) RETURNING id",
            new
            {
                GoogleSub = email.ToLowerInvariant(),
                Email = email,
                DisplayName = displayName,
            });

        return ServiceResult<User>.Success(new User
        {
            Id = id,
            GoogleSub = email.ToLowerInvariant(),
            Email = email,
            DisplayName = displayName,
            IsActive = true,
        });
    }

    public async Task<ServiceResult> RemoveAsync(long id, string currentEmail)
    {
        var user = await GetByIdAsync(id);
        if (user is null)
            return ServiceResult.Fail("Không tìm thấy user.");

        if (string.Equals(user.Email, currentEmail, StringComparison.OrdinalIgnoreCase))
            return ServiceResult.Fail("Không thể xóa tài khoản đang đăng nhập.");

        await using var conn = db.Create();
        var total = await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM users");
        if (total <= 1)
            return ServiceResult.Fail("Phải giữ ít nhất một user trong hệ thống.");

        await conn.ExecuteAsync("DELETE FROM users WHERE id = @Id", new { Id = id });
        return ServiceResult.Success();
    }
}
