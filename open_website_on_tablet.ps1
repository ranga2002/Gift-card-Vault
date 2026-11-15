$adb = "C:\Users\saibh\.gemini\antigravity\scratch\android-debloat\platform-tools\adb.exe"
$device = "192.168.0.107:41893"
$url = "https://vacuum-crossing-feedback-announce.trycloudflare.com"

& $adb connect $device
& $adb -s $device shell am start -a android.intent.action.VIEW -d $url

