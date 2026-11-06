#!/bin/sh
export MSYS_NO_PATHCONV=1  # Git Bash no Windows converteria /backup/... em caminho do Windows
# Importa workflows/*.json para dentro do n8n (container em execução).
docker compose exec n8n n8n import:workflow --separate --input=/backup/workflows
