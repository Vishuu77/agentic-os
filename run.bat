@echo off
REM Agentic OS - shareable zero-keys launcher
REM Needs: Node 18+, Ollama running
where node >nul 2>nul || (echo Install Node 18+ first & pause & exit /b 1)
echo Pulling local models (first run only, free, offline after)...
ollama pull qwen3:1.7b
ollama pull gemma3:1b
echo Checking lanes...
node src/index.js doctor
echo Starting UI on http://127.0.0.1:4310 ...
start "" http://127.0.0.1:4310
node src/index.js ui --port 4310
