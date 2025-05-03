package config

import (
	"log"
	"os"
	"strconv"
	"time"
	"errors"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the application
type Config struct {
	// Server configuration
	ServerPort     string
	ServerTimeout  time.Duration
	TrustedProxies []string

	// MongoDB configuration
	MongoURI          string
	MongoDatabase     string
	MongoCollection   string
	MongoConnTimeout  time.Duration
	MongoMaxPoolSize  uint64
	MongoMinPoolSize  uint64
	MongoRetryWrites  bool
	MongoRetryReads   bool

	// RabbitMQ configuration
	RabbitMQHost     string
	RabbitMQPort     string
	RabbitMQUser     string
	RabbitMQPassword string
	RabbitMQExchange string
	RabbitMQRoutingKey string

	// Application configuration
	Environment string
	LogLevel    string
}

// LoadConfig loads configuration from environment variables
func LoadConfig() (*Config, error) {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found or error loading it. Using environment variables.")
	}

	serverTimeout, err := getEnvDuration("SERVER_TIMEOUT", 30*time.Second)
	if err != nil {
		return nil, err
	}

	mongoConnTimeout, err := getEnvDuration("MONGO_CONN_TIMEOUT", 10*time.Second)
	if err != nil {
		return nil, err
	}

	mongoMaxPoolSize, err := getEnvUint64("MONGO_MAX_POOL_SIZE", 100)
	if err != nil {
		return nil, err
	}

	mongoMinPoolSize, err := getEnvUint64("MONGO_MIN_POOL_SIZE", 5)
	if err != nil {
		return nil, err
	}

	mongoRetryWrites, err := getEnvBool("MONGO_RETRY_WRITES", true)
	if err != nil {
		return nil, err
	}

	mongoRetryReads, err := getEnvBool("MONGO_RETRY_READS", true)
	if err != nil {
		return nil, err
	}

	config := &Config{
		// Server configuration
		ServerPort:    getEnv("SERVER_PORT", "8080"),
		ServerTimeout: serverTimeout,
		TrustedProxies: getEnvList("TRUSTED_PROXIES", []string{}),

		// MongoDB configuration
		MongoURI:         os.Getenv("MONGO_URI"), // "mongodb://localhost:27017"
		MongoDatabase:    getEnv("MONGO_DATABASE", "messages"),
		MongoCollection:  getEnv("MONGO_COLLECTION", "notifications"),
		MongoConnTimeout: mongoConnTimeout,
		MongoMaxPoolSize: mongoMaxPoolSize,
		MongoMinPoolSize: mongoMinPoolSize,
		MongoRetryWrites: mongoRetryWrites,
		MongoRetryReads:  mongoRetryReads,

		// RabbitMQ configuration
		RabbitMQHost:     os.Getenv("RABBITMQ_HOST"),
		RabbitMQPort:     os.Getenv("RABBITMQ_PORT"),
		RabbitMQUser:     os.Getenv("RABBITMQ_USER"),
		RabbitMQPassword: os.Getenv("RABBITMQ_PASSWORD"),
		RabbitMQExchange: getEnv("RABBITMQ_EXCHANGE", "notifications"),
		RabbitMQRoutingKey: getEnv("RABBITMQ_ROUTING_KEY", "user.notification"),

		// Application configuration
		Environment: getEnv("ENVIRONMENT", "development"),
		LogLevel:    getEnv("LOG_LEVEL", "info"),
	}

	return config, nil
}

// Validate checks if the configuration is valid
func (c *Config) Validate() error {
	if c.MongoURI == "" {
		return errors.New("missing MONGO_URI")
	}
	if c.RabbitMQHost == "" {
		return errors.New("missing RABBITMQ_HOST")
	}
	if c.RabbitMQPort == "" {
		return errors.New("missing RABBITMQ_PORT")
	}
	if c.RabbitMQUser == "" {
		return errors.New("missing RABBITMQ_USER")
	}
	if c.RabbitMQPassword == "" {
		return errors.New("missin RABBITMQ_PASSWORD")
	}
	
	return nil
}

// Helper functions for loading environment variables with fallbacks

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func getEnvList(key string, fallback []string) []string {
	if value, exists := os.LookupEnv(key); exists {
		// Parse comma-separated values
		// This is a simple implementation; you might want to handle quotes and escaping
		if value == "" {
			return []string{}
		}
		return splitAndTrim(value, ",")
	}
	return fallback
}

// splitAndTrim splits a string by separator and trims spaces from each element
func splitAndTrim(s, sep string) []string {
	parts := []string{}
	// Implementation omitted for brevity
	return parts
}

func getEnvDuration(key string, fallback time.Duration) (time.Duration, error) {
	if value, exists := os.LookupEnv(key); exists {
		return time.ParseDuration(value)
	}
	return fallback, nil
}

func getEnvUint64(key string, fallback uint64) (uint64, error) {
	if value, exists := os.LookupEnv(key); exists {
		return strconv.ParseUint(value, 10, 64)
	}
	return fallback, nil
}

func getEnvBool(key string, fallback bool) (bool, error) {
	if value, exists := os.LookupEnv(key); exists {
		return strconv.ParseBool(value)
	}
	return fallback, nil
}