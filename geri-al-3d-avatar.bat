@echo off
REM Neon Sehir - 3D avatar guncellemesini tamamen geri alir.
REM Yedekteki orijinal dosyalar geri yuklenir, 3D avatar dosyalari silinir.
cd /d "%~dp0"
set "Y=_yedek_3d_avatar"
if not exist "%Y%\cityEngine.js" (
  echo HATA: Yedek bulunamadi: %Y%\cityEngine.js
  pause
  exit /b 1
)
echo 3D avatar guncellemesi geri aliniyor...
copy /Y "%Y%\cityEngine.js" "src\components\City\cityEngine.js" >nul || goto hata
if exist "%Y%\avatarShapes.js" copy /Y "%Y%\avatarShapes.js" "src\lib\avatarShapes.js" >nul || goto hata
if exist "%Y%\AvatarBuilder.jsx" copy /Y "%Y%\AvatarBuilder.jsx" "src\components\AvatarBuilder\AvatarBuilder.jsx" >nul || goto hata
if exist "%Y%\AvatarBuilder.css" copy /Y "%Y%\AvatarBuilder.css" "src\components\AvatarBuilder\AvatarBuilder.css" >nul || goto hata
if exist "%Y%\CostumeShop.jsx" copy /Y "%Y%\CostumeShop.jsx" "src\components\CostumeShop\CostumeShop.jsx" >nul || goto hata
if exist "%Y%\CostumeShop.css" copy /Y "%Y%\CostumeShop.css" "src\components\CostumeShop\CostumeShop.css" >nul || goto hata
if exist "%Y%\HomeScreen.jsx" copy /Y "%Y%\HomeScreen.jsx" "src\components\HomeScreen\HomeScreen.jsx" >nul || goto hata
if exist "%Y%\HomeScreen.css" copy /Y "%Y%\HomeScreen.css" "src\components\HomeScreen\HomeScreen.css" >nul || goto hata
if exist "%Y%\functions-index.js" copy /Y "%Y%\functions-index.js" "functions\index.js" >nul || goto hata
if exist "src\components\City\avatar3d.js" del /Q "src\components\City\avatar3d.js"
if exist "src\lib\avatar3dView.js" del /Q "src\lib\avatar3dView.js"
if exist "src\components\Avatar3D" rmdir /S /Q "src\components\Avatar3D"
echo.
echo Tamam: oyun eski kagit figur avatarlara dondu.
echo Oyunculara ulasmasi icin yayinla.bat ile yeniden yayinla
echo (sunucu dosyasi da geri alindigi icin Firebase sorusuna "e" de).
echo Yedek klasoru (%Y%) silinmedi.
pause
exit /b 0
:hata
echo HATA: dosya geri yuklenemedi.
pause
exit /b 1
