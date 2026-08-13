using System.Text;
using Inventory.Api.Auth;
using Inventory.Api.Data;
using Inventory.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<DbConnectionFactory>();
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<GoogleAuthService>();
builder.Services.AddScoped<CategoryService>();
builder.Services.AddScoped<ProductService>();
builder.Services.AddScoped<TransactionService>();
builder.Services.AddScoped<ExportSlipService>();
builder.Services.AddScoped<ImportSlipService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<LegacyImportService>();
builder.Services.AddScoped<SettingsService>();

builder.Services.AddControllers();
var corsOrigins = (builder.Configuration["Cors:Origins"] ?? "http://localhost:5173")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Select(o => o.Trim())
    .Where(o => o.Length > 0)
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

builder.Services.AddCors(o =>
{
    o.AddDefaultPolicy(p =>
    {
        p.WithOrigins(corsOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .SetPreflightMaxAge(TimeSpan.FromHours(1));
    });
});

var jwtSecret = builder.Configuration["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret required");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (HttpMethods.IsOptions(context.Request.Method))
                    context.NoResult();
                return Task.CompletedTask;
            },
        };
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

app.Logger.LogInformation("CORS origins: {Origins}", string.Join(", ", corsOrigins));

// CORS first — always answer preflight and attach headers (including on errors)
app.Use(async (ctx, next) =>
{
    var origin = ctx.Request.Headers.Origin.ToString();
    if (!string.IsNullOrEmpty(origin) &&
        corsOrigins.Any(o => string.Equals(o, origin, StringComparison.OrdinalIgnoreCase)))
    {
        ctx.Response.Headers["Access-Control-Allow-Origin"] = origin;
        ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
        ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
        ctx.Response.Headers["Vary"] = "Origin";
    }

    if (HttpMethods.IsOptions(ctx.Request.Method) &&
        !ctx.Request.Path.StartsWithSegments("/health"))
    {
        ctx.Response.StatusCode = StatusCodes.Status204NoContent;
        return;
    }

    await next();
});

app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
var healthOk = () => Results.Ok(new { status = "ok" });
app.MapMethods("/health", ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], healthOk)
    .AllowAnonymous();
app.MapGet("/health/cors", () => Results.Ok(new { origins = corsOrigins }));
app.MapGet("/health/db", async (DbConnectionFactory db) =>
{
    try
    {
        await using var conn = db.Create();
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT 1";
        await cmd.ExecuteScalarAsync();
        return Results.Ok(new { status = "ok", database = "connected" });
    }
    catch (Exception ex)
    {
        return Results.Json(new { status = "error", message = ex.Message }, statusCode: 503);
    }
});

app.Run();
