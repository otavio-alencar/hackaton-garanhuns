#!/bin/sh
# Exporta os workflows do n8n para workflows/ (sem credenciais) para versionar no git.
docker compose exec n8n n8n export:workflow --all --separate --output=/backup/workflows
