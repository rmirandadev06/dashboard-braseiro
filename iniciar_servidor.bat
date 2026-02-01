@echo off
title Servidor do Dashboard Financeiro

echo ==================================================
echo       INICIANDO O SERVIDOR DO DASHBOARD
echo ==================================================
echo.
echo (Esta janela deve permanecer aberta!)
echo.

REM Navega para a pasta 'backend' do seu projeto
REM !!! MUDE A LINHA ABAIXO PARA O CAMINHO CORRETO NO SEU PC !!!
cd /d D:\PROJETOS\dashboard-restaurante\backend

REM Executa o comando para iniciar o servidor
npm run dev