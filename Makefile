# ─────────────────────────────────────────────────────────────────────────
#  MGG — friendly wrappers around docker compose.
#  Run `make` (or `make help`) to list available commands.
# ─────────────────────────────────────────────────────────────────────────

# Use bash with strict flags for recipe lines.
SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

# `docker compose` (v2 plugin) is the canonical invocation. Override if needed:
#   make up COMPOSE="docker-compose"
COMPOSE ?= docker compose

# Services whose logs you usually care about.
LOG_SERVICES ?= panel daemon

# Where backups land on the host (matches deploy/install.sh).
BACKUP_DIR ?= /var/lib/mgg/backups

.DEFAULT_GOAL := help
.PHONY: help install up down restart logs ps update build backup-db

help: ## Show this help (default)
	@echo "MGG — available commands:"
	@echo ""
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo ""

install: ## Install / deploy MGG (runs deploy/install.sh as root)
	@sudo bash deploy/install.sh

up: ## Start the whole stack in the background
	@$(COMPOSE) up -d

down: ## Stop and remove the stack's containers
	@$(COMPOSE) down

restart: ## Restart all services
	@$(COMPOSE) restart

logs: ## Follow logs for the panel + daemon (LOG_SERVICES to override)
	@$(COMPOSE) logs -f $(LOG_SERVICES)

ps: ## Show the status of all services
	@$(COMPOSE) ps

build: ## (Re)build the images
	@$(COMPOSE) build

update: ## Pull latest code, rebuild, and relaunch
	@echo "▸ Pulling latest code…"
	@git pull --ff-only
	@echo "▸ Rebuilding images…"
	@$(COMPOSE) build
	@echo "▸ Restarting stack…"
	@$(COMPOSE) up -d
	@echo "✓ Updated."

backup-db: ## Dump the Postgres database to $(BACKUP_DIR)
	@mkdir -p "$(BACKUP_DIR)"
	@set -a; [ -f .env ] && . ./.env; set +a; \
	user="$${POSTGRES_USER:-mgg}"; db="$${POSTGRES_DB:-mgg}"; \
	out="$(BACKUP_DIR)/mgg-db-$$(date -u +%Y%m%dT%H%M%SZ).sql.gz"; \
	echo "▸ Dumping database '$$db' as '$$user' → $$out"; \
	$(COMPOSE) exec -T postgres pg_dump -U "$$user" -d "$$db" | gzip > "$$out"; \
	echo "✓ Backup written: $$out"
