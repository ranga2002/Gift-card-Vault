$ErrorActionPreference = "Stop"
$src = "C:\Users\saibh\.gemini\antigravity\scratch\coupon-vault"
$dst = "D:\0commondownload\Coupon-Gift-Vault"

Copy-Item -Path "$src\cloud_server.js" -Destination "$dst\cloud_server.js" -Force
Copy-Item -Path "$src\assets\index.html" -Destination "$dst\assets\index.html" -Force
Copy-Item -Path "$src\assets\index.html" -Destination "$dst\index.html" -Force

Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

& "C:\Program Files\nodejs\node.exe" "$src\cloud_server.js"
