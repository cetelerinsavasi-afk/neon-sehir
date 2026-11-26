@echo off
REM Neon Sehir - 3D avatar guncellemesini tamamen geri alir.
REM Yedekteki orijinal dosyalar geri yuklenir, avatar3d.js silinir.
cd /d "%~dp0"
set "Y=_yedek_3d_avatar"
if not exist "%Y%\cityEngine.js" (
  echo HATA: Yedek bulunamadi: %Y%\cityEngine.js
  pause
  exit /b 1
)
echo 3D avatar guncellemesi geri aliniyor...
copy /Y "%Y%\cityEngine.js" "src\components\City\cityEngine.js" >/dev/null || goto hata
if exist "%Y%\avatarShapes.js" copy /Y "%Y%\avatarShapes.js" "src\lib\avatarShapes.js" >/dev/null || goto hata
if exist "%Y%\AvatarBuilder.jsx" copy /Y "%Y%\AvatarBuilder.jsx" "src\components\AvatarBuilder\AvatarBuilder.jsx" >/dev/null || goto hata
if exist "%Y%\functions-index.js" copy /Y "%Y%\functions-index.js" "functions\index.js" >/dev/null || goto hata
if exist "src\components\City\avatar3d.js" del /Q "src\components\City\avatar3d.js"
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
