@echo off
REM Neon Sehir v177b GERI AL: _v177bb\yedek'teki eski dosyalari yerine koyar, v177b'nin yeni
REM dosyalarini siler (sadece bilgisayarinda). Yayindan da geri almak icin sonra:
REM firebase deploy + git commit + push gerekir (Claude'a sor).
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist "%HERE%yedek" (
  echo _v177bb\yedek yok - once yukle-v177b.bat calismamis. HICBIR SEY YAPILMADI.
  goto son
)
xcopy "%HERE%yedek\*" "%CD%" /E /Y /I /Q >nul
for %%F in (src\components\Phone\borsa\BorsaApp.css preview\borsa.html) do if exist "%%F" del /q "%%F"
echo Eski dosyalar yerine kondu, v177b'nin yeni dosyalari silindi.
goto son

:yanlis
echo Bu _v177bb klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
