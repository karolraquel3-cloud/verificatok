@echo off
cd /d "%~dp0"
for /f "tokens=*" %%P in ('powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'preview-server.ps1|server.js' } | Select-Object -ExpandProperty ProcessId"') do taskkill /F /PID %%P >nul 2>nul
if exist "%~dp0.preview.pid" powershell.exe -NoProfile -Command "$id=Get-Content '%~dp0.preview.pid' -ErrorAction SilentlyContinue; if($id){Stop-Process -Id ([int]$id) -Force -ErrorAction SilentlyContinue}"
if exist "%~dp0.verificatok.pid" powershell.exe -NoProfile -Command "$id=Get-Content '%~dp0.verificatok.pid' -ErrorAction SilentlyContinue; if($id){Stop-Process -Id ([int]$id) -Force -ErrorAction SilentlyContinue}"
if exist "%ProgramFiles%\nodejs\node.exe" (
  start "VerificaTok backend" cmd /k ""%ProgramFiles%\nodejs\node.exe" "%~dp0server.js""
) else (
  start "VerificaTok preview" cmd /k powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0preview-server.ps1"
)
timeout /t 2 /nobreak >nul
start "" http://localhost:3000/
