package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"notification-api/internal/models"
	"notification-api/internal/publisher"
	"notification-api/internal/repository"
)

// NotificationService handles notification business logic
type NotificationService struct {
	repo      repository.NotificationRepository
	publisher *publisher.RabbitMQPublisher
}

// NewNotificationService creates a new notification service
func NewNotificationService(repo repository.NotificationRepository, pub *publisher.RabbitMQPublisher) *NotificationService {
	return &NotificationService{
		repo:      repo,
		publisher: pub,
	}
}

// CreateNotification creates a new notification, stores it in MongoDB, and publishes it to RabbitMQ
func (s *NotificationService) CreateNotification(ctx context.Context, req models.NotificationRequest) (string, error) {
	// Create notification message
	notificationMsg := models.NewNotificationMessage(req.Type, req.Message, req.Phone, req.ImageURL)
	
	// Add extra info if provided
	if req.ExtraInfo != nil {
		notificationMsg.ExtraInfo = req.ExtraInfo
	}

	// Create notification record with pending status
	notificationRecord := models.NewNotificationRecord(*notificationMsg)

	// Save to MongoDB
	id, err := s.repo.SaveNotification(ctx, notificationRecord)
	if err != nil {
		return "", fmt.Errorf("failed to save notification: %w", err)
	}

	// Publish to RabbitMQ
	err = s.publisher.Publish(*notificationMsg)
	if err != nil {
		// Update status to failed
		updateErr := s.repo.UpdateStatus(ctx, id, models.StatusFailed, err)
		if updateErr != nil {
			log.Printf("Failed to update notification status: %v", updateErr)
		}
		return "", fmt.Errorf("failed to publish notification: %w", err)
	}

	return id, nil
}

// GetNotification retrieves a notification by ID
func (s *NotificationService) GetNotification(ctx context.Context, id string) (*models.NotificationRecord, error) {
	notification, err := s.repo.GetNotificationByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get notification: %w", err)
	}
	if notification == nil {
		return nil, nil // Not found
	}
	return notification, nil
}

// RetryFailedNotifications retries failed notifications
func (s *NotificationService) RetryFailedNotifications(ctx context.Context, maxRetries int) (int, error) {
	// Get pending notifications (limited to a reasonable batch size)
	failedNotifications, err := s.repo.GetPendingNotifications(ctx, 100)
	if err != nil {
		return 0, fmt.Errorf("failed to get failed notifications: %w", err)
	}

	retryCount := 0
	for _, notification := range failedNotifications {
		// Skip notifications that have been retried too many times
		if notification.RetryCount >= maxRetries {
			continue
		}

		// Try to publish to RabbitMQ
		err := s.publisher.Publish(notification.Message)
		if err != nil {
			// Update retry count and error
			updateErr := s.repo.UpdateStatus(ctx, notification.ID.Hex(), models.StatusFailed, err)
			if updateErr != nil {
				log.Printf("Failed to update notification status: %v", updateErr)
			}
			continue
		}

		// Mark as pending again
		updateErr := s.repo.UpdateStatus(ctx, notification.ID.Hex(), models.StatusPending, nil)
		if updateErr != nil {
			log.Printf("Failed to update notification status: %v", updateErr)
			continue
		}

		retryCount++
	}

	return retryCount, nil
}

// MarkAsDelivered marks a notification as delivered
func (s *NotificationService) MarkAsDelivered(ctx context.Context, id string) error {
	err := s.repo.UpdateStatus(ctx, id, models.StatusDelivered, nil)
	if err != nil {
		return fmt.Errorf("failed to mark notification as delivered: %w", err)
	}
	return nil
}

// MarkAsFailed marks a notification as failed
func (s *NotificationService) MarkAsFailed(ctx context.Context, id string, err error) error {
	updateErr := s.repo.UpdateStatus(ctx, id, models.StatusFailed, err)
	if updateErr != nil {
		return fmt.Errorf("failed to mark notification as failed: %w", updateErr)
	}
	return nil
}

// StartPeriodicRetry starts a periodic retry of failed notifications
func (s *NotificationService) StartPeriodicRetry(interval time.Duration, maxRetries int) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			count, err := s.RetryFailedNotifications(ctx, maxRetries)
			if err != nil {
				log.Printf("Error retrying failed notifications: %v", err)
			} else if count > 0 {
				log.Printf("Successfully retried %d failed notifications", count)
			}
			cancel()
		}
	}()
}
