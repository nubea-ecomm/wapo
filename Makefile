.PHONY: secrets up down dev-api test-go fmt-go check
GO_IMAGE := golang:1.26-alpine
GO_RUN := docker run --rm -v "$(CURDIR)/apps/server:/src" -v wapo-go-cache:/go/pkg -v wapo-go-build:/root/.cache/go-build -w /src $(GO_IMAGE)
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
	$(GO_RUN) gofmt -w cmd internal
check:
	pnpm format:check
	pnpm lint
	pnpm typecheck
	pnpm build
	pnpm test
	$(MAKE) test-go

test-integration:
	node scripts/test-go.mjs
