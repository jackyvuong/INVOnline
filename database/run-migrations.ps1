# Run all migrations + seeds (requires psql + DATABASE_URL)
param(
    [Parameter(Mandatory = $true)]
    [string]$DatabaseUrl
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== Migrations ===" -ForegroundColor Cyan
Get-ChildItem "$root\migrations\V*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "Applying $($_.Name)..."
    & psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" }
}

Write-Host "=== Seeds ===" -ForegroundColor Cyan
Get-ChildItem "$root\seeds\S*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "Seeding $($_.Name)..."
    & psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" }
}

Write-Host "Done." -ForegroundColor Green
