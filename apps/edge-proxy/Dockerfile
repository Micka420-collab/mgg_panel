# ── MGG edge proxy (wake-on-join) ─────────────────────────────────────
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /edge-proxy ./...

FROM gcr.io/distroless/static-debian12
COPY --from=build /edge-proxy /edge-proxy
ENTRYPOINT ["/edge-proxy"]
