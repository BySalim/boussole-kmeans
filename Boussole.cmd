@echo off
title Boussole
"%~dp0.venv\Scripts\python.exe" "%~dp0application\demarrer.py" %*
if errorlevel 1 pause
