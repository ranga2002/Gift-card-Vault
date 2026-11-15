$src = "C:\Users\saibh\.gemini\antigravity\scratch\coupon-vault"
$dst = "D:\0commondownload\Coupon-Gift-Vault"

New-Item -ItemType Directory -Force -Path $dst, "$dst\assets", "$dst\backups", "$dst\supabase\migrations" | Out-Null

Copy-Item -Path "$src\assets\index.html" -Destination "$dst\assets\index.html" -Force
Copy-Item -Path "$src\assets\index.html" -Destination "$dst\index.html" -Force
Copy-Item -Path "$src\cloud_server.js" -Destination "$dst\cloud_server.js" -Force
Copy-Item -Path "$src\cloud_vault_state.json" -Destination "$dst\cloud_vault_state.json" -Force
Copy-Item -Path "$src\firebase.json" -Destination "$dst\firebase.json" -Force
Copy-Item -Path "$src\start_public_website.ps1" -Destination "$dst\start_public_website.ps1" -Force
Copy-Item -Path "$src\backups\*" -Destination "$dst\backups\" -Force
Copy-Item -Path "$src\supabase\migrations\*" -Destination "$dst\supabase\migrations\" -Force

Write-Output "Successfully copied Coupon-Gift-Vault project & backups to $dst"
Get-ChildItem -Path $dst -Recurse | Select-Object FullName, Length

