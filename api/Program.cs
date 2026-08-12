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
builder.Services.AddScoped<SettingsService>();

builder.Services.AddControllers();
builder.Services.AddCors(o =>
{
    o.AddDefaultPolicy(p =>
    {
        var origins = builder.Configuration["Cors:Origins"]?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            ?? ["http://localhost:5173"];
        p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
    });
});

var jwtSecret = builder.Configuration["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret required");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
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

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();
