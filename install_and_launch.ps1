$adb = "C:\Users\saibh\.gemini\antigravity\scratch\android-debloat\platform-tools\adb.exe"
$device = "192.168.0.107:41893"
$apk = "C:\Users\saibh\.gemini\antigravity\scratch\coupon-vault\CouponVault.apk"

Write-Output "1. Connecting to Samsung Tab S10 FE ($device)..."
& $adb connect $device

Write-Output "2. Installing updated CouponVault.apk..."
$installRes = & $adb -s $device install -r $apk 2>&1
if ($installRes -match "INSTALL_FAILED_UPDATE_INCOMPATIBLE") {
    & $adb -s $device uninstall com.saibh.couponvault | Out-Null
    & $adb -s $device install $apk
} else {
    Write-Output $installRes
}

Write-Output "3. Restarting Coupon & Gift Vault on tablet screen..."
& $adb -s $device shell am force-stop com.saibh.couponvault
& $adb -s $device shell am start -n com.saibh.couponvault/.MainActivity

Write-Output "Done! Upgraded Coupon & Gift Vault is now running on your tablet."
