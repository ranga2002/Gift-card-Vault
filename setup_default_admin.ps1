$body = @{
    name = "Sai (Super Admin)"
    email = "admin@couponvault.com"
    password = "Admin@1234"
} | ConvertTo-Json

try {
    $res = Invoke-RestMethod -Uri "http://localhost:8787/api/auth/setup-admin" -Method Post -Body $body -ContentType "application/json"
    Write-Output "Admin setup response: ok=$($res.ok), email=$($res.user.email)"
} catch {
    Write-Output "Setup call message: $($_.Exception.Message)"
}

$vault = Invoke-RestMethod -Uri "http://localhost:8787/api/vault" -Method Get
Write-Output "Vault status: ok=$($vault.ok), needsAdminSetup=$($vault.needsAdminSetup)"

