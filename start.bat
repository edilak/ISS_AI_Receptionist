@echo off
echo ========================================
echo ISS AI Receptionist - Starting...
echo ========================================
echo.

REM Check if .env exists
if not exist .env (
    echo [WARNING] .env file not found!
    echo.
    echo Please create a .env file with:
    echo   PORT=5000
    echo   GOOGLE_API_KEY=your_google_api_key_here
    echo   REACT_APP_API_URL=http://localhost:5000/api
    echo.
    pause
    exit /b 1
)

echo Starting server and client...
echo.
echo Backend will run on: http://localhost:5000
echo Frontend will run on: http://localhost:3000
echo.
echo Press Ctrl+C to stop
echo.

npm run dev

