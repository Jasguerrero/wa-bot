package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"notification-api/internal/api"
	"notification-api/internal/config"
	"notification-api/internal/repository"
	"notification-api/internal/publisher"
	"notification-api/internal/service"
	"notification-api/internal/api/handlers"
)

func main() {
	if err := godotenv.Overload(".env"); err != nil {
		log.Fatalf("Error loading env file %v", err)
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load configuration %v", err)
	}

	// Validate configuration
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Invalid configuration: %v", err)
	}
	
	// Set up MongoDB repository
	repo, err := repository.NewMongoRepository(cfg)
	if err != nil {
		log.Fatalf("Failed to create MongoDB repository: %v", err)
	}
	defer repo.Close()

	// Set up RabbitMQ publisher
	pub, err := publisher.NewRabbitMQPublisher(cfg)
	if err != nil {
		log.Fatalf("Failed to create RabbitMQ publisher: %v", err)
	}
	defer pub.Close()

	// Set up service
	notificationService := service.NewNotificationService(repo, pub)
	
	// Start periodic retry for failed notifications (every 5 minutes, max 5 retries)
	//notificationService.StartPeriodicRetry(5*time.Minute, 5)

	// Set up handlers
	notificationHandler := handlers.NewNotificationHandler(notificationService)

	// Set up router
	router := api.SetupRouter(cfg, notificationHandler)

	// Create HTTP server
	server := &http.Server{
		Addr:              ":" + cfg.ServerPort,
		Handler:           router,
		ReadTimeout:       cfg.ServerTimeout,
		WriteTimeout:      cfg.ServerTimeout,
		IdleTimeout:       2 * cfg.ServerTimeout,
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		log.Printf("Starting server on port %s", cfg.ServerPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Set up graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// Give server 30 seconds to finish processing requests
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited gracefully")
}
