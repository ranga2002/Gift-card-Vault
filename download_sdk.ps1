$toolsDir = "C:\Users\saibh\.gemini\antigravity\scratch\coupon-vault\tools"

Write-Output "1/3 Downloading Android Build Tools r34..."
curl.exe -s -L -o "$toolsDir\build-tools.zip" "https://dl.google.com/android/repository/build-tools_r34-windows.zip"

Write-Output "2/3 Downloading Android 34 Platform Jar..."
curl.exe -s -L -o "$toolsDir\platform.zip" "https://dl.google.com/android/repository/platform-34-ext7_r02.zip"

Write-Output "3/3 Downloading Portable OpenJDK 17..."
curl.exe -s -L -o "$toolsDir\jdk17.zip" "https://aka.ms/download-jdk/microsoft-jdk-17-windows-x64.zip"

Write-Output "All downloads complete!"
Get-ChildItem $toolsDir\*.zip | Select-Object Name, Length

