.PHONY: up down logs test lint

up:
	docker compose up --build -d

down:
	docker compose down -v

logs:
	docker compose logs -f

test:
	docker compose exec backend pytest -v

lint:
	docker compose exec backend ruff check app/ worker/
