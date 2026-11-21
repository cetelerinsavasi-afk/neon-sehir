@echo off
REM Neon Sehir v174 GERI AL: _v174\yedek'teki eski dosyalari yerine koyar (sadece bilgisayarinda).
REM Yayindan da geri almak icin sonra: git add + commit + push ve fonksiyonlari tekrar yukle (Claude'a sor).
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "%HERE%yedek\src" (
  echo _v174\yedek bulunamadi - once yukle-v174.bat calismis olmali. HICBIR SEY YAPILMADI.
  goto son
)
xcopy "%HERE%yedek\*" "%CD%" /E /Y /I /Q >nul
echo Eski dosyalar yerine kondu.
:son
echo.
pause
