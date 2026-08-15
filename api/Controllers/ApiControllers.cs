namespace Inventory.Api.Controllers;

using System.Text.Json;
using Dapper;
using Google.Apis.Auth;
using Inventory.Api.Auth;
using Inventory.Api.Data;
using Inventory.Api.Models;
using Inventory.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class AuthController(
    GoogleAuthService googleAuth,
    JwtTokenService jwt,
    IConfiguration config,
    ILogger<AuthController> logger) : ControllerBase
{
    public record GoogleLoginRequest(string IdToken);

    [HttpPost("google")]
    [AllowAnonymous]
    public async Task<IActionResult> GoogleLogin([FromBody] GoogleLoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.IdToken))
            return BadRequest(new { message = "Thiếu idToken." });

        try
        {
            var clientId = config["Google:ClientId"] ?? "";
            var user = await googleAuth.ValidateExistingUserAsync(req.IdToken, clientId);
            var token = jwt.CreateToken(user);
            return Ok(new { token, user = new { user.Email, user.DisplayName, user.AvatarUrl } });
        }
        catch (InvalidJwtException)
        {
            return Unauthorized(new { message = "Google token không hợp lệ." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Google login failed");
            return StatusCode(500, new { message = "Lỗi server khi đăng nhập. Kiểm tra kết nối database." });
        }
    }

    [HttpGet("me")]
    [Authorize]
    public IActionResult Me() => Ok(new { email = User.GetUserEmail(), name = User.Identity?.Name });
}

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController(ProductService products, TransactionService transactions) : ControllerBase
{
    [HttpGet("stats")]
    public async Task<IActionResult> Stats() => Ok(await products.GetDashboardStatsAsync());

    [HttpGet("recent-transactions")]
    public async Task<IActionResult> Recent() => Ok(await transactions.GetRecentAsync(5));

    [HttpGet("alerts")]
    public async Task<IActionResult> Alerts() => Ok(await products.GetAlertsAsync(8));
}

[ApiController]
[Route("api/categories")]
[Authorize]
public class CategoriesController(CategoryService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] PagedQuery q)
        => Ok(await service.GetPagedAsync(q));

    [HttpGet("options")]
    public async Task<IActionResult> Options() => Ok(await service.GetOptionsAsync());

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Get(long id)
    {
        var item = await service.GetByIdAsync(id);
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Category input)
    {
        var result = await service.CreateAsync(input, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpPut("{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] Category input)
    {
        var result = await service.UpdateAsync(id, input, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id)
    {
        var result = await service.RemoveAsync(id, User.GetUserEmail());
        return result.Ok ? NoContent() : BadRequest(result);
    }
}

[ApiController]
[Route("api/products")]
[Authorize]
public class ProductsController(ProductService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] PagedQuery q,
        [FromQuery] string? category,
        [FromQuery] string? status)
        => Ok(await service.GetPagedAsync(q, category, status));

    [HttpGet("options")]
    public async Task<IActionResult> Options() => Ok(await service.GetOptionsAsync());

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Get(long id)
    {
        var p = await service.GetByIdAsync(id);
        return p is null ? NotFound() : Ok(p);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Product input)
    {
        var result = await service.CreateAsync(input, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpPut("{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] Product input)
    {
        var result = await service.UpdateAsync(id, input, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id)
    {
        var result = await service.RemoveAsync(id, User.GetUserEmail());
        return result.Ok ? NoContent() : BadRequest(result);
    }
}

[ApiController]
[Route("api/transactions")]
[Authorize]
public class TransactionsController(TransactionService service) : ControllerBase
{
    public record CreateTxRequest(string Date, string Type, long ProductId, decimal Quantity, string? Note);

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] PagedQuery q,
        [FromQuery] string? type,
        [FromQuery] string? category,
        [FromQuery] long? productId,
        [FromQuery] string? dateFrom,
        [FromQuery] string? dateTo)
        => Ok(await service.GetPagedAsync(q, type, category, productId, dateFrom, dateTo));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTxRequest req)
    {
        var result = await service.CreateAsync(req.Date, req.Type, req.ProductId, req.Quantity, req.Note ?? "", User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }
}

[ApiController]
[Route("api/export-slips")]
[Authorize]
public class ExportSlipsController(ExportSlipService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] PagedQuery q,
        [FromQuery] string? status,
        [FromQuery] string? dateFrom,
        [FromQuery] string? dateTo)
        => Ok(await service.GetPagedAsync(q, status, dateFrom, dateTo));

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Get(long id)
    {
        var item = await service.GetByIdAsync(id);
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ExportSlip input)
    {
        var result = await service.CreateAsync(input, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpPut("{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] ExportSlip input)
    {
        var result = await service.UpdateAsync(id, input, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id)
    {
        var result = await service.RemoveAsync(id, User.GetUserEmail());
        return result.Ok ? NoContent() : BadRequest(result);
    }

    [HttpPost("{id:long}/complete")]
    public async Task<IActionResult> Complete(long id)
    {
        var result = await service.CompleteAsync(id, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpPost("{id:long}/return")]
    public async Task<IActionResult> Return(long id)
    {
        var result = await service.ReturnAsync(id, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpPost("{id:long}/copy")]
    public async Task<IActionResult> Copy(long id)
    {
        var result = await service.CopyAsync(id, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }
}

[ApiController]
[Route("api/import-slips")]
[Authorize]
public class ImportSlipsController(ImportSlipService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] PagedQuery q,
        [FromQuery] string? status,
        [FromQuery] string? dateFrom,
        [FromQuery] string? dateTo)
        => Ok(await service.GetPagedAsync(q, status, dateFrom, dateTo));

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Get(long id)
    {
        var item = await service.GetByIdAsync(id);
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ImportSlip input)
    {
        var result = await service.CreateAsync(input, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpPut("{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] ImportSlip input)
    {
        var result = await service.UpdateAsync(id, input, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id)
    {
        var result = await service.RemoveAsync(id, User.GetUserEmail());
        return result.Ok ? NoContent() : BadRequest(result);
    }

    [HttpPost("{id:long}/complete")]
    public async Task<IActionResult> Complete(long id)
    {
        var result = await service.CompleteAsync(id, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpPost("{id:long}/return")]
    public async Task<IActionResult> Return(long id)
    {
        var result = await service.ReturnAsync(id, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpPost("{id:long}/copy")]
    public async Task<IActionResult> Copy(long id)
    {
        var result = await service.CopyAsync(id, User.GetUserEmail());
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }
}

[ApiController]
[Route("api/reports")]
[Authorize]
public class ReportsController(ReportService service) : ControllerBase
{
    [HttpGet("stock-period")]
    public async Task<IActionResult> StockPeriod([FromQuery] string from, [FromQuery] string to)
    {
        var result = await service.BuildStockReportAsync(from, to);
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }
}

[ApiController]
[Route("api/settings")]
[Authorize]
public class SettingsController(SettingsService settings) : ControllerBase
{
    [HttpGet("export")]
    public async Task<IActionResult> Export() => Ok(await settings.ExportAsync());

    [HttpPost("import")]
    public async Task<IActionResult> Import([FromBody] System.Text.Json.JsonElement payload)
    {
        var result = await settings.ImportAsync(payload, User.GetUserEmail());
        return result.Ok ? Ok(new { ok = true, summary = result.Data }) : BadRequest(result);
    }

    [HttpPost("repair")]
    public async Task<IActionResult> Repair([FromBody] System.Text.Json.JsonElement payload)
    {
        var result = await settings.RepairAsync(payload, User.GetUserEmail());
        return result.Ok ? Ok(new { ok = true, summary = result.Data }) : BadRequest(result);
    }

    [HttpPost("clear")]
    public async Task<IActionResult> Clear()
    {
        var result = await settings.ClearAllAsync(User.GetUserEmail());
        return result.Ok ? Ok(new { ok = true }) : BadRequest(result);
    }
}

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController(UserService service) : ControllerBase
{
    public record CreateUserRequest(string Email, string? DisplayName);

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await service.GetAllAsync());

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest req)
    {
        var result = await service.CreateAsync(req.Email, req.DisplayName ?? "");
        return result.Ok ? Ok(result.Data) : BadRequest(result);
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id)
    {
        var result = await service.RemoveAsync(id, User.GetUserEmail());
        return result.Ok ? NoContent() : BadRequest(result);
    }
}
