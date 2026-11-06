#!/bin/sh
export MSYS_NO_PATHCONV=1  # Git Bash no Windows converteria /backup/... em caminho do Windows
# Exporta os workflows do n8n para workflows/ (sem credenciais) para versionar no git.
docker compose exec n8n n8n export:workflow --all --separate --output=/backup/workflows
