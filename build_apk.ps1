$ErrorActionPreference = "Continue"

$projDir = "C:\Users\saibh\.gemini\antigravity\scratch\coupon-vault"
$toolsDir = "$projDir\tools"
$buildTools = "$toolsDir\android-14"
$jdkBin = "$toolsDir\jdk-17.0.21.0.2+1\bin"
$androidJar = (Get-ChildItem "$toolsDir\android-34" -Recurse -Filter "android.jar" | Select-Object -First 1).FullName

$aapt2 = "$buildTools\aapt2.exe"
$zipalign = "$buildTools\zipalign.exe"
$d8Jar = "$buildTools\lib\d8.jar"
$apksignerJar = "$buildTools\lib\apksigner.jar"
$java = "$jdkBin\java.exe"
$javac = "$jdkBin\javac.exe"
$keytool = "$jdkBin\keytool.exe"

$buildDir = "$projDir\build"
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
New-Item -ItemType Directory -Force -Path "$buildDir\gen", "$buildDir\obj", "$buildDir\dex" | Out-Null

Write-Output "1. Compiling resources with aapt2..."
& $aapt2 compile --dir "$projDir\res" -o "$buildDir\resources.zip"

Write-Output "2. Linking resources, manifest, and assets with aapt2..."
& $aapt2 link `
    -o "$buildDir\unaligned.apk" `
    -I $androidJar `
    --manifest "$projDir\AndroidManifest.xml" `
    -A "$projDir\assets" `
    --java "$buildDir\gen" `
    "$buildDir\resources.zip" `
    --auto-add-overlay

Write-Output "3. Compiling Java sources with javac..."
$javaFiles = @(
    "$projDir\src\com\saibh\couponvault\MainActivity.java",
    "$buildDir\gen\com\saibh\couponvault\R.java"
)
& $javac -encoding UTF-8 --release 11 -cp $androidJar -d "$buildDir\obj" $javaFiles

Write-Output "4. Compiling .class files to classes.dex with D8..."
$classFiles = Get-ChildItem -Path "$buildDir\obj" -Recurse -Filter "*.class" | Select-Object -ExpandProperty FullName
& $java -cp $d8Jar com.android.tools.r8.D8 --lib $androidJar --min-api 26 --output "$buildDir\dex" $classFiles

Write-Output "5. Packaging classes.dex into APK..."
$jar = "$jdkBin\jar.exe"
& $jar uf "$buildDir\unaligned.apk" -C "$buildDir\dex" classes.dex

Write-Output "6. Aligning APK with zipalign..."
& $zipalign -f -p 4 "$buildDir\unaligned.apk" "$buildDir\aligned.apk"

Write-Output "7. Generating signing key and signing APK with apksigner..."
$keystore = "$projDir\release.keystore"
if (-not (Test-Path $keystore)) {
    & $keytool -genkeypair -v `
        -keystore $keystore `
        -alias vaultkey `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -storepass vault123 `
        -keypass vault123 `
        -dname "CN=CouponVault, OU=Mobile, O=Saibh, L=IN, S=IN, C=IN"
}

$finalApk = "$projDir\CouponVault.apk"
& $java -jar $apksignerJar sign `
    --ks $keystore `
    --ks-key-alias vaultkey `
    --ks-pass pass:vault123 `
    --key-pass pass:vault123 `
    --out $finalApk `
    "$buildDir\aligned.apk"

Write-Output "SUCCESS! Built signed APK:"
Get-Item $finalApk | Select-Object FullName, Length
