$adb = "C:\Users\saibh\.gemini\antigravity\scratch\android-debloat\platform-tools\adb.exe"
$device = "192.168.0.107:41893"

& $adb connect $device
& $adb -s $device uninstall com.saibh.couponvault

