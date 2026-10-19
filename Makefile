.PHONY: secrets up down dev-api test-go fmt-go lint-go check
GO_IMAGE := golang:1.26-alpine
GO_RUN := docker run --rm -v "$(CURDIR)/apps/server:/src" -v wapo-go-cache:/go/pkg -v wapo-go-build:/root/.cache/go-build -w /src $(GO_IMAGE)
GOLANGCI_LINT_IMAGE := golangci/golangci-lint:v2.15.0
GOLANGCI_LINT_RUN := docker run --rm -v "$(CURDIR)/apps/server:/src" -v wapo-go-cache:/go/pkg -v wapo-go-build:/root/.cache/go-build -v wapo-golangci-cache:/root/.cache/golangci-lint -w /src $(GOLANGCI_LINT_IMAGE) golangci-lint
secrets:
	@$(GO_RUN) go run ./cmd/wapo secrets
up:
	docker compose up --build -d
down:
	docker compose down
dev-api:
	cd apps/server && go run ./cmd/wapo
test-go:
	$(GO_RUN) go test ./...
fmt-go:
	$(GOLANGCI_LINT_RUN) fmt
	$(GOLANGCI_LINT_RUN) run --fix ./...
	$(GOLANGCI_LINT_RUN) fmt
lint-go:
	$(GOLANGCI_LINT_RUN) fmt --diff
	$(GOLANGCI_LINT_RUN) run ./...
check:
	pnpm format:check
	pnpm lint
	pnpm typecheck
	pnpm build
	pnpm test
	$(MAKE) lint-go
	$(MAKE) test-go

test-integration:
	node scripts/test-go.mjs
