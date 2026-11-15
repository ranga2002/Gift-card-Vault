$src = "C:\Users\saibh\.gemini\antigravity\scratch\coupon-vault"
$dst = "D:\0commondownload\Coupon-Gift-Vault"

New-Item -ItemType Directory -Force -Path $dst, "$dst\assets", "$dst\backups", "$dst\supabase\migrations" | Out-Null

Copy-Item -Path "$src\assets\index.html" -Destination "$dst\assets\index.html" -Force
Copy-Item -Path "$src\assets\index.html" -Destination "$dst\index.html" -Force
Copy-Item -Path "$src\cloud_server.js" -Destination "$dst\cloud_server.js" -Force

Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "$src\cloud_server.js" -WorkingDirectory $src -WindowStyle Hidden
Start-Sleep -Seconds 2

$res = Invoke-RestMethod -Uri "http://localhost:8787/api/vault" -Method Get
Write-Output "Local API status: ok=$($res.ok), needsAdminSetup=$($res.needsAdminSetup)"

