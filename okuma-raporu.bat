@echo off
REM v187 - Firestore okuma olcumu raporu (Cloud Logging ns_read_stats). Gerekli: gcloud auth login
cd /d "%~dp0"
node scripts\okuma-raporu.mjs %*
echo.
pause
