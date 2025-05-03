package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"

	"notification-api/internal/models"
	"notification-api/internal/service"
)

// NotificationHandler handles HTTP requests for notifications
type NotificationHandler struct {
	service   *service.NotificationService
	validator *validator.Validate
}

// NewNotificationHandler creates a new notification handler
func NewNotificationHandler(service *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{
		service:   service,
		validator: validator.New(),
	}
}

// Create handles the creation of a new notification
// @Summary Create a new notification
// @Description Create a new notification, store it in MongoDB, and publish it to RabbitMQ
// @Tags notifications
// @Accept json
// @Produce json
// @Param notification body models.NotificationRequest true "Notification Request"
// @Success 201 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /notifications [post]
func (h *NotificationHandler) Create(c *gin.Context) {
	var req models.NotificationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	// Validate request
	if err := h.validator.Struct(req); err != nil {
		validationErrors := err.(validator.ValidationErrors)
		errors := make(map[string]string)
		for _, e := range validationErrors {
			errors[e.Field()] = e.Tag()
		}
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "Validation failed",
			"fields": errors,
		})
		return
	}

	// Create notification
	id, err := h.service.CreateNotification(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":      id,
		"message": "Notification queued successfully",
	})
}

// Get handles the retrieval of a notification by ID
// @Summary Get a notification by ID
// @Description Get a notification record by ID
// @Tags notifications
// @Accept json
// @Produce json
// @Param id path string true "Notification ID"
// @Success 200 {object} models.NotificationRecord
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /notifications/{id} [get]
func (h *NotificationHandler) Get(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID is required"})
		return
	}

	notification, err := h.service.GetNotification(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if notification == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Notification not found"})
		return
	}

	c.JSON(http.StatusOK, notification)
}

// UpdateStatus handles the update of a notification status
// @Summary Update notification status
// @Description Update the status of a notification
// @Tags notifications
// @Accept json
// @Produce json
// @Param id path string true "Notification ID"
// @Param status body map[string]string true "Status Update"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /notifications/{id}/status [patch]
func (h *NotificationHandler) UpdateStatus(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID is required"})
		return
	}

	var req struct {
		Status string `json:"status" binding:"required,oneof=delivered failed"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	// Check if notification exists
	notification, err := h.service.GetNotification(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if notification == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Notification not found"})
		return
	}

	// Update status
	var updateErr error
	if req.Status == "delivered" {
		updateErr = h.service.MarkAsDelivered(c.Request.Context(), id)
	} else if req.Status == "failed" {
		updateErr = h.service.MarkAsFailed(c.Request.Context(), id, nil)
	}

	if updateErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": updateErr.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Status updated successfully"})
}

// RegisterRoutes registers the notification routes
func (h *NotificationHandler) RegisterRoutes(router *gin.RouterGroup) {
	notifications := router.Group("/notifications")
	{
		notifications.POST("", h.Create)
		notifications.GET("/:id", h.Get)
		notifications.PATCH("/:id/status", h.UpdateStatus)
	}
}
