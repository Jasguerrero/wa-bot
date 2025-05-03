package middleware

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RequestID adds a unique request ID to each request
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Check if request already has an ID
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			// Generate a new UUID
			requestID = uuid.New().String()
		}

		// Set the request ID in the context and header
		c.Set("RequestID", requestID)
		c.Writer.Header().Set("X-Request-ID", requestID)
		c.Next()
	}
}

// Logger logs request details
func Logger() gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		// Get request ID if available
		requestID, exists := param.Keys["RequestID"]
		requestIDStr := "-"
		if exists {
			requestIDStr = requestID.(string)
		}

		// Format log entry
		return fmt.Sprintf("[%s] %s | %s | %d | %s | %s | %s | %s | %s\n",
			param.TimeStamp.Format(time.RFC3339),
			requestIDStr,
			param.ClientIP,
			param.StatusCode,
			param.Latency,
			param.Method,
			param.Path,
			param.Request.UserAgent(),
			param.ErrorMessage,
		)
	})
}

// Timeout adds a timeout to the request context
func Timeout(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Wrap the request with a timeout context
		ctx, cancel := time.NewTimer(timeout).C, func() {}

		defer cancel()

		// Create a done channel to signal when the request is done
		done := make(chan struct{})
		
		// Process the request in a goroutine
		go func() {
			c.Next()
			close(done)
		}()

		// Wait for either the request to complete or timeout
		select {
		case <-done:
			// Request completed normally
			return
		case <-ctx:
			// Request timed out
			c.AbortWithStatusJSON(408, gin.H{
				"error": "Request timeout",
			})
			return
		}
	}
}
