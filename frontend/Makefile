.PHONY: help install dev build start lint type-check clean format test

help:
	@echo "CIC Insurance Chatbot Frontend - Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install       - Install dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make dev           - Start development server (http://localhost:3000)"
	@echo "  make dev-silent    - Start dev server without output"
	@echo ""
	@echo "Building:"
	@echo "  make build         - Build for production"
	@echo "  make build-analyze - Build with bundle analysis"
	@echo ""
	@echo "Running:"
	@echo "  make start         - Start production server"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint          - Run ESLint"
	@echo "  make type-check    - Check TypeScript types"
	@echo "  make format        - Format code with Prettier (if configured)"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean         - Remove build artifacts and node_modules"
	@echo "  make clean-cache   - Clear Next.js cache"
	@echo ""
	@echo "Testing:"
	@echo "  make test          - Run tests (if configured)"
	@echo ""

install:
	npm install

dev:
	npm run dev

dev-silent:
	npm run dev > /dev/null 2>&1 &

build:
	npm run build

build-analyze:
	npm run build -- --analyze

start:
	npm start

lint:
	npm run lint

type-check:
	npm run type-check

format:
	npm run format || echo "Format script not configured"

clean:
	rm -rf node_modules .next out dist build

clean-cache:
	rm -rf .next

clean-all: clean clean-cache

test:
	npm test || echo "Tests not configured"

# Development workflow
dev-check: type-check lint
	@echo "✅ All checks passed!"

# Quick rebuild
rebuild: clean-cache build

# Install and start dev
setup: install dev

.DEFAULT_GOAL := help
