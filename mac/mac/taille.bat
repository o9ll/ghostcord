@echo off
REM Change the Windows cursor size (Accessibility)
REM Cursor size:
REM 1=Small, 2=Medium, 3=Large, 4=Extra Large

set CURSOR_SIZE=4

REM Modify the registry value
REG ADD "HKCU\Control Panel\Cursors" /v "CursorBaseSize" /t REG_DWORD /d %CURSOR_SIZE% /f

REM Force cursor reset
RUNDLL32.EXE user32.dll,UpdatePerUserSystemParameters

echo Cursor size changed to %CURSOR_SIZE%.
pause
