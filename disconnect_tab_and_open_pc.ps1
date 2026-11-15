$adb = "C:\Users\saibh\.gemini\antigravity\scratch\android-debloat\platform-tools\adb.exe"

Write-Output "1. Disconnecting from Samsung Tab S10 FE and stopping ADB server..."
& $adb disconnect
& $adb kill-server

Write-Output "2. Opening Coupon & Gift Vault website in your PC browser..."
Start-Process "https://vacuum-crossing-feedback-announce.trycloudflare.com"
Write-Output "Done!"

