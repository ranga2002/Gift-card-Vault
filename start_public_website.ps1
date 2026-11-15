Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "C:\Users\saibh\.gemini\antigravity\scratch\coupon-vault\cloud_server.js" -WindowStyle Hidden
Start-Sleep -Seconds 1
& "C:\Users\saibh\.gemini\antigravity\scratch\coupon-vault\tools\cloudflared.exe" tunnel --url http://localhost:8787 --no-autoupdate

