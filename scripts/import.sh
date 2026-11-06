#!/bin/sh
# Importa workflows/*.json para dentro do n8n (container em execução).
docker compose exec n8n n8n import:workflow --separate --input=/backup/workflows
