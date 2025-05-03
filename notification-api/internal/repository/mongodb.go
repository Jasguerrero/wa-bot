package repository

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"notification-api/internal/config"
	"notification-api/internal/models"
)

// NotificationRepository defines the interface for notification storage
type NotificationRepository interface {
	SaveNotification(ctx context.Context, notification *models.NotificationRecord) (string, error)
	UpdateStatus(ctx context.Context, id string, status models.NotificationStatus, err error) error
	GetNotificationByID(ctx context.Context, id string) (*models.NotificationRecord, error)
	GetPendingNotifications(ctx context.Context, limit int) ([]*models.NotificationRecord, error)
	Close() error
}

// MongoRepository implements NotificationRepository using MongoDB
type MongoRepository struct {
	client     *mongo.Client
	collection *mongo.Collection
}

// NewMongoRepository creates a new MongoDB repository
func NewMongoRepository(cfg *config.Config) (NotificationRepository, error) {
	// Create MongoDB connection options
	clientOptions := options.Client().
		ApplyURI(cfg.MongoURI).
		SetConnectTimeout(cfg.MongoConnTimeout).
		SetMaxPoolSize(cfg.MongoMaxPoolSize).
		SetMinPoolSize(cfg.MongoMinPoolSize).
		SetRetryWrites(cfg.MongoRetryWrites).
		SetRetryReads(cfg.MongoRetryReads)

	// Connect to MongoDB
	ctx, cancel := context.WithTimeout(context.Background(), cfg.MongoConnTimeout)
	defer cancel()

	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	// Ping the database to verify connection
	if err = client.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	// Get collection
	collection := client.Database(cfg.MongoDatabase).Collection(cfg.MongoCollection)

	// Create indexes
	indexModels := []mongo.IndexModel{
		{
			Keys: bson.D{{Key: "message.id", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys: bson.D{{Key: "status", Value: 1}},
			Options: options.Index().SetBackground(true),
		},
		{
			Keys: bson.D{
				{Key: "status", Value: 1},
				{Key: "retry_count", Value: 1},
				{Key: "created_at", Value: 1},
			},
			Options: options.Index().SetBackground(true),
		},
	}

	_, err = collection.Indexes().CreateMany(ctx, indexModels)
	if err != nil {
		return nil, fmt.Errorf("failed to create indexes: %w", err)
	}

	return &MongoRepository{
		client:     client,
		collection: collection,
	}, nil
}

// SaveNotification stores a notification in MongoDB
func (r *MongoRepository) SaveNotification(ctx context.Context, notification *models.NotificationRecord) (string, error) {
	result, err := r.collection.InsertOne(ctx, notification)
	if err != nil {
		return "", fmt.Errorf("failed to save notification: %w", err)
	}

	id, ok := result.InsertedID.(primitive.ObjectID)
	if !ok {
		return "", fmt.Errorf("failed to get inserted ID")
	}

	return id.Hex(), nil
}

// UpdateStatus updates the status of a notification
func (r *MongoRepository) UpdateStatus(ctx context.Context, id string, status models.NotificationStatus, err error) error {
	objectID, parseErr := primitive.ObjectIDFromHex(id)
	if parseErr != nil {
		return fmt.Errorf("invalid object ID: %w", parseErr)
	}

	update := bson.M{
		"$set": bson.M{
			"status": status,
		},
	}

	// Add error message if provided
	if err != nil {
		update["$set"].(bson.M)["error"] = err.Error()
		update["$inc"] = bson.M{"retry_count": 1}
	}

	// Add delivered timestamp if status is delivered
	if status == models.StatusDelivered {
		now := time.Now()
		update["$set"].(bson.M)["delivered_at"] = now
	}

	_, updateErr := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": objectID},
		update,
	)

	if updateErr != nil {
		return fmt.Errorf("failed to update notification status: %w", updateErr)
	}

	return nil
}

// GetNotificationByID retrieves a notification by ID
func (r *MongoRepository) GetNotificationByID(ctx context.Context, id string) (*models.NotificationRecord, error) {
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, fmt.Errorf("invalid object ID: %w", err)
	}

	var notification models.NotificationRecord
	err = r.collection.FindOne(ctx, bson.M{"_id": objectID}).Decode(&notification)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil // Not found
		}
		return nil, fmt.Errorf("failed to get notification: %w", err)
	}

	return &notification, nil
}

// GetPendingNotifications retrieves pending notifications
func (r *MongoRepository) GetPendingNotifications(ctx context.Context, limit int) ([]*models.NotificationRecord, error) {
	findOptions := options.Find().
		SetLimit(int64(limit)).
		SetSort(bson.D{{Key: "created_at", Value: 1}})

	cursor, err := r.collection.Find(
		ctx,
		bson.M{"status": models.StatusPending},
		findOptions,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get pending notifications: %w", err)
	}
	defer cursor.Close(ctx)

	var notifications []*models.NotificationRecord
	if err = cursor.All(ctx, &notifications); err != nil {
		return nil, fmt.Errorf("failed to decode notifications: %w", err)
	}

	return notifications, nil
}

// Close closes the MongoDB connection
func (r *MongoRepository) Close() error {
	return r.client.Disconnect(context.Background())
}
