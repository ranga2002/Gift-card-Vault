$toolsDir = "C:\Users\saibh\.gemini\antigravity\scratch\coupon-vault\tools"

Write-Output "Extracting build-tools.zip..."
tar.exe -xf "$toolsDir\build-tools.zip" -C $toolsDir

Write-Output "Extracting platform.zip..."
tar.exe -xf "$toolsDir\platform.zip" -C $toolsDir

Write-Output "Extracting jdk17.zip..."
tar.exe -xf "$toolsDir\jdk17.zip" -C $toolsDir

Write-Output "Extraction complete!"
Get-ChildItem $toolsDir -Directory | Select-Object Name

