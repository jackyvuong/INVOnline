namespace Inventory.Api.Data;

using Npgsql;

public class DbConnectionFactory(IConfiguration config)
{
    private readonly string _connectionString = config.GetConnectionString("Default")
        ?? throw new InvalidOperationException("Missing ConnectionStrings:Default");

    public NpgsqlConnection Create() => new(_connectionString);
}
