# Build stage
FROM golang:1.24-alpine AS builder

# Set working directory
WORKDIR /app

# Install necessary build tools
RUN apk add --no-cache git ca-certificates tzdata && \
    update-ca-certificates

# Copy go.mod and go.sum and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/notification-api ./cmd

# Runtime stage
FROM alpine:3.21

# Set working directory
WORKDIR /app

# Install certificates and timezone data
RUN apk --no-cache add ca-certificates tzdata && \
    update-ca-certificates

# Create a non-root user and group
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy the binary from the builder stage
COPY --from=builder /app/notification-api /app/notification-api

# Copy configuration files
COPY --from=builder /app/.env /app/.env

# Set ownership and permissions
RUN chown -R appuser:appgroup /app && \
    chmod +x /app/notification-api

# Switch to non-root user
USER appuser

# Expose the API port
EXPOSE 8080

# Set the entrypoint
ENTRYPOINT ["/app/notification-api"]
