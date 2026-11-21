@echo off
REM Neon Sehir v173 GERI AL: _v173\yedek'teki eski dosyalari yerine koyar (sadece bilgisayarinda).
REM Yayindan da geri almak icin sonra: git add + commit + push ve fonksiyonlari tekrar yukle (Claude'a sor).
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "%HERE%yedek\src" (
  echo _v173\yedek bulunamadi - once yukle-v173.bat calismis olmali. HICBIR SEY YAPILMADI.
  goto son
)
xcopy "%HERE%yedek\*" "%CD%" /E /Y /I /Q >nul
echo Eski dosyalar yerine kondu.
:son
echo.
pause
