@echo off
chcp 65001 >nul 2>&1
title Knowledge Base Backend

echo ============================================
echo   Enterprise Knowledge Base - 启动脚本
echo ============================================
echo.

cd /d "%~dp0"

:: 检查 .env 文件
if not exist ".env" (
    echo [INFO] 未检测到 .env 文件，从 .env.example 复制...
    copy ".env.example" ".env" >nul
    echo [INFO] 已创建 .env，请根据需要修改配置后重新运行
    echo.
    pause
    exit /b 0
)

:: 检查虚拟环境
if not exist ".venv\Scripts\activate.bat" (
    echo [ERROR] 未检测到虚拟环境 .venv
    echo [INFO] 请先运行: uv venv --python 3.12 然后 uv pip install -r requirements.txt
    pause
    exit /b 1
)

:: 激活虚拟环境
call .venv\Scripts\activate.bat

:: 设置 UTF-8 编码（防止 pip/文件读取乱码）
set PYTHONUTF8=1

:: 禁止 transformers 连接 HuggingFace Hub（国内无法访问）
set HF_HUB_OFFLINE=1
set TRANSFORMERS_OFFLINE=1

:: 询问是否启动基础设施服务
echo [INFO] 是否启动 Docker 基础设施服务？
echo        (PostgreSQL, Redis, Qdrant, MinIO, Ollama)
echo.
set /p START_INFRA="     [Y/n]: "

if /i not "%START_INFRA%"=="n" (
    echo.
    echo [INFO] 启动基础设施服务...
    cd ..
    docker compose up -d postgres redis qdrant minio ollama
    if %ERRORLEVEL% neq 0 (
        echo [WARN] Docker 服务启动失败，请确保 Docker Desktop 已运行
    ) else (
        echo [INFO] 基础设施服务已启动
        echo [INFO] 等待服务就绪...
        timeout /t 5 /nobreak >nul
    )
    cd backend
)

echo.
echo ============================================
echo   启动后端服务 (uvicorn)
echo   地址: http://localhost:8000
echo   文档: http://localhost:8000/docs
echo   按 Ctrl+C 停止服务
echo ============================================
echo.

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

pause
