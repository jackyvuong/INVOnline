namespace Inventory.Api.Auth;

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Google.Apis.Auth;
using Inventory.Api.Data;
using Inventory.Api.Models;
using Microsoft.IdentityModel.Tokens;
using Dapper;

public class JwtTokenService(IConfiguration config)
{
    public string CreateToken(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Secret"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiry = DateTime.UtcNow.AddMinutes(int.Parse(config["Jwt:ExpiryMinutes"] ?? "480"));

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.DisplayName),
            new Claim("sub", user.GoogleSub),
        };

        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"],
            audience: config["Jwt:Audience"],
            claims: claims,
            expires: expiry,
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public class GoogleAuthService(DbConnectionFactory dbFactory)
{
    /// <summary>Chỉ cho login nếu email đã có trong bảng users (admin thêm trước).</summary>
    public async Task<User> ValidateExistingUserAsync(string idToken, string clientId)
    {
        var payload = await GoogleJsonWebSignature.ValidateAsync(idToken, new GoogleJsonWebSignature.ValidationSettings
        {
            Audience = [clientId],
        });

        if (string.IsNullOrWhiteSpace(payload.Email))
            throw new UnauthorizedAccessException("Google account không có email.");

        await using var conn = dbFactory.Create();
        await conn.OpenAsync();

        var existing = await conn.QuerySingleOrDefaultAsync<User>(
            @"SELECT id, google_sub AS GoogleSub, email AS Email, display_name AS DisplayName,
              avatar_url AS AvatarUrl, is_active AS IsActive, last_login_at AS LastLoginAt
              FROM users
              WHERE google_sub = @GoogleSub OR LOWER(email) = LOWER(@Email)
              LIMIT 1",
            new { GoogleSub = payload.Subject, Email = payload.Email });

        if (existing is null)
            throw new UnauthorizedAccessException("Email chưa được cấp quyền truy cập. Liên hệ quản trị viên.");

        if (!existing.IsActive)
            throw new UnauthorizedAccessException("Tài khoản đã bị vô hiệu hóa.");

        await conn.ExecuteAsync(
            @"UPDATE users SET google_sub = @GoogleSub, email = @Email, display_name = @DisplayName,
              avatar_url = @AvatarUrl, last_login_at = NOW(), updated_at = NOW()
              WHERE id = @Id",
            new
            {
                GoogleSub = payload.Subject,
                Email = payload.Email,
                DisplayName = payload.Name ?? payload.Email,
                AvatarUrl = payload.Picture ?? "",
                Id = existing.Id,
            });

        existing.GoogleSub = payload.Subject;
        existing.Email = payload.Email;
        existing.DisplayName = payload.Name ?? payload.Email;
        existing.AvatarUrl = payload.Picture ?? "";
        return existing;
    }
}

public static class UserExtensions
{
    public static string GetUserEmail(this HttpContext ctx) =>
        ctx.User.FindFirstValue(ClaimTypes.Email) ?? "";

    public static string GetUserEmail(this ClaimsPrincipal user) =>
        user.FindFirstValue(ClaimTypes.Email) ?? "";
}
