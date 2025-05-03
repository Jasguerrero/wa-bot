package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// NotificationStatus represents the status of a notification
type NotificationStatus string

const (
	// StatusPending indicates the notification is pending delivery
	StatusPending NotificationStatus = "pending"
	// StatusDelivered indicates the notification has been delivered
	StatusDelivered NotificationStatus = "delivered"
	// StatusFailed indicates the notification delivery failed
	StatusFailed NotificationStatus = "failed"
)

// NotificationMessage represents a notification message
type NotificationMessage struct {
	ID        string                 `json:"id" bson:"id"`
	Type      string                 `json:"type" bson:"type"`
	Message   string                 `json:"message" bson:"message"`
	Phone     string				 `json:"phone" bson:"phone"`
	ImageURL  string                 `json:"image_url,omitempty" bson:"image_url,omitempty"`
	ExtraInfo map[string]interface{} `json:"extra_info,omitempty" bson:"extra_info,omitempty"`
	CreatedAt time.Time              `json:"created_at" bson:"created_at"`
}

// NotificationRecord represents a notification record in MongoDB
type NotificationRecord struct {
	ID         primitive.ObjectID    `json:"_id,omitempty" bson:"_id,omitempty"`
	Message    NotificationMessage   `json:"message" bson:"message"`
	Status     NotificationStatus    `json:"status" bson:"status"`
	QueuedAt   time.Time             `json:"queued_at" bson:"queued_at"`
	DeliveredAt *time.Time           `json:"delivered_at,omitempty" bson:"delivered_at,omitempty"`
	RetryCount int                   `json:"retry_count" bson:"retry_count"`
	Error      string                `json:"error,omitempty" bson:"error,omitempty"`
}

// NotificationRequest represents the request format for creating a notification
type NotificationRequest struct {
	Type      string                 `json:"type" validate:"required"`
	Message   string                 `json:"message" validate:"required"`
	Phone     string                 `json:"phone" validate:"required"`
	ImageURL  string                 `json:"image_url,omitempty"`
	ExtraInfo map[string]interface{} `json:"extra_info,omitempty"`
}

// NewNotificationMessage creates a new notification message with default values
func NewNotificationMessage(msgType, message, phone, imageURL string) *NotificationMessage {
	return &NotificationMessage{
		ID:        time.Now().Format("20060102150405"),
		Type:      msgType,
		Message:   message,
		Phone:     phone,
		ImageURL:  imageURL,
		ExtraInfo: make(map[string]interface{}),
		CreatedAt: time.Now(),
	}
}

// NewNotificationRecord creates a new notification record with pending status
func NewNotificationRecord(message NotificationMessage) *NotificationRecord {
	return &NotificationRecord{
		Message:    message,
		Status:     StatusPending,
		QueuedAt:   time.Now(),
		RetryCount: 0,
	}
}
