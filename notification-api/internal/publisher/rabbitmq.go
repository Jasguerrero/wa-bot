package publisher

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"notification-api/internal/config"
	"notification-api/internal/models"
)

// RabbitMQPublisher handles publishing messages to RabbitMQ
type RabbitMQPublisher struct {
	cfg          *config.Config
	connection   *amqp.Connection
	channel      *amqp.Channel
	exchangeName string
	routingKey   string
	asyncChannel chan models.NotificationMessage
	publishMutex sync.Mutex
	
	// Connection management
	reconnectDelay time.Duration
	isConnected    bool
	connClosed     chan *amqp.Error
	channelClosed  chan *amqp.Error
	done           chan bool
	connLock       sync.Mutex
}

// NewRabbitMQPublisher creates a new RabbitMQ publisher
func NewRabbitMQPublisher(cfg *config.Config) (*RabbitMQPublisher, error) {
	publisher := &RabbitMQPublisher{
		cfg:            cfg,
		exchangeName:   cfg.RabbitMQExchange,
		routingKey:     cfg.RabbitMQRoutingKey,
		asyncChannel:   make(chan models.NotificationMessage, 100),
		publishMutex:   sync.Mutex{},
		reconnectDelay: 5 * time.Second,
		isConnected:    false,
		connClosed:     make(chan *amqp.Error),
		channelClosed:  make(chan *amqp.Error),
		done:           make(chan bool),
		connLock:       sync.Mutex{},
	}

	// Connect to RabbitMQ
	if err := publisher.connect(); err != nil {
		log.Printf("Failed to connect to RabbitMQ initially: %v", err)
		log.Printf("Will keep trying to connect to RabbitMQ in the background...")
		
		// Start connection monitor in background
		go publisher.connectionMonitor()
	}

	// Start async publisher worker
	go publisher.startAsyncWorker()

	return publisher, nil
}

// connect establishes a connection to RabbitMQ
func (p *RabbitMQPublisher) connect() error {
	p.connLock.Lock()
	defer p.connLock.Unlock()

	if p.isConnected {
		return nil
	}

	// Create RabbitMQ connection URL
	rabbitURL := fmt.Sprintf("amqp://%s:%s@%s:%s/",
		p.cfg.RabbitMQUser,
		p.cfg.RabbitMQPassword,
		p.cfg.RabbitMQHost,
		p.cfg.RabbitMQPort)

	// Connect to RabbitMQ
	conn, err := amqp.Dial(rabbitURL)
	if err != nil {
		return fmt.Errorf("error connecting to RabbitMQ: %v", err)
	}

	// Create a channel
	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return fmt.Errorf("error creating RabbitMQ channel: %v", err)
	}

	// Check if exchange exists without trying to recreate it
	err = ch.ExchangeDeclarePassive(
		p.exchangeName, // exchange name
		"direct",       // exchange type
		true,           // durable
		false,          // auto-deleted
		false,          // internal
		false,          // no-wait
		nil,            // arguments
	)
	if err != nil {
		ch.Close()
		conn.Close()
		return fmt.Errorf("error declaring exchange: %v", err)
	}

	// Set up notification channels for connection and channel closures
	p.connection = conn
	p.channel = ch
	p.isConnected = true

	// Set up notification on closed connection
	p.connClosed = make(chan *amqp.Error)
	p.connection.NotifyClose(p.connClosed)

	// Set up notification on closed channel
	p.channelClosed = make(chan *amqp.Error)
	p.channel.NotifyClose(p.channelClosed)

	log.Println("Successfully connected to RabbitMQ")
	return nil
}

// reconnect continuously tries to reconnect to RabbitMQ
func (p *RabbitMQPublisher) reconnect() {
	for {
		p.connLock.Lock()
		if p.isConnected {
			p.connLock.Unlock()
			break
		}
		p.connLock.Unlock()

		log.Printf("Attempting to reconnect to RabbitMQ in %v...", p.reconnectDelay)
		time.Sleep(p.reconnectDelay)
		
		if err := p.connect(); err != nil {
			log.Printf("Failed to reconnect to RabbitMQ: %v", err)
			continue
		}
		
		break
	}
}

// connectionMonitor handles reconnecting when the connection is lost
func (p *RabbitMQPublisher) connectionMonitor() {
	// First try to connect if not already connected
	if !p.isConnected {
		p.reconnect()
	}

	for {
		select {
		case <-p.done:
			return
		case <-p.connClosed:
			log.Println("RabbitMQ connection closed. Reconnecting...")
			p.handleDisconnect()
		case <-p.channelClosed:
			log.Println("RabbitMQ channel closed. Reconnecting...")
			p.handleDisconnect()
		}
	}
}

// handleDisconnect handles a disconnection event
func (p *RabbitMQPublisher) handleDisconnect() {
	p.connLock.Lock()
	p.isConnected = false
	if p.channel != nil {
		p.channel.Close()
		p.channel = nil
	}
	if p.connection != nil {
		p.connection.Close()
		p.connection = nil
	}
	p.connLock.Unlock()

	// Attempt to reconnect
	p.reconnect()
}

// Close closes the RabbitMQ connection and channel
func (p *RabbitMQPublisher) Close() error {
	// Signal the connection monitor to stop
	close(p.done)

	p.connLock.Lock()
	defer p.connLock.Unlock()

	if p.channel != nil {
		p.channel.Close()
	}
	if p.connection != nil {
		return p.connection.Close()
	}
	return nil
}

// Publish sends a message to RabbitMQ
func (p *RabbitMQPublisher) Publish(msg models.NotificationMessage) error {
	// Try the async channel first, fall back to direct publish if channel is full
	select {
	case p.asyncChannel <- msg:
		return nil
	default:
		// Channel is full, publish directly
		log.Println("Async channel is full, publishing directly")
		return p.publishDirect(msg)
	}
}

// publishDirect sends a message directly to RabbitMQ with reconnection support
func (p *RabbitMQPublisher) publishDirect(msg models.NotificationMessage) error {
	p.publishMutex.Lock()
	defer p.publishMutex.Unlock()

	// Ensure connection is available
	if !p.isConnected {
		return fmt.Errorf("not connected to RabbitMQ")
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Marshal message to JSON
	body, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("error marshalling message to JSON: %v", err)
	}

	// Publish to RabbitMQ
	err = p.channel.PublishWithContext(
		ctx,
		p.exchangeName, // exchange
		p.routingKey,   // routing key
		false,          // mandatory
		false,          // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			Body:         body,
			DeliveryMode: amqp.Persistent, // Message persistence (2 = persistent)
		},
	)

	if err != nil {
		// Mark connection as closed to trigger reconnection
		p.handleDisconnect()
		return fmt.Errorf("error publishing message: %v", err)
	}
	return nil
}

// startAsyncWorker processes messages from the async channel with retry logic
func (p *RabbitMQPublisher) startAsyncWorker() {
	retryQueue := make(map[string]models.NotificationMessage)
	ticker := time.NewTicker(5 * time.Second)
	
	for {
		select {
		case <-p.done:
			ticker.Stop()
			return
		case msg := <-p.asyncChannel:
			// Try to publish the message
			if err := p.publishWithRetry(msg, 3); err != nil {
				log.Printf("Failed to publish message after retries, queuing for later retry: %v", err)
				retryQueue[msg.ID] = msg
			}
		case <-ticker.C:
			// Process retry queue
			if len(retryQueue) > 0 {
				log.Printf("Processing %d messages in retry queue", len(retryQueue))
				for id, msg := range retryQueue {
					if p.isConnected {
						if err := p.publishWithRetry(msg, 1); err == nil {
							delete(retryQueue, id)
						}
					}
				}
			}
		}
	}
}

// publishWithRetry attempts to publish a message with retries
func (p *RabbitMQPublisher) publishWithRetry(msg models.NotificationMessage, maxRetries int) error {
	var lastErr error
	
	for i := 0; i < maxRetries; i++ {
		// If not connected, try to reconnect
		if !p.isConnected {
			p.reconnect()
			if !p.isConnected {
				time.Sleep(time.Second)
				continue
			}
		}
		
		if err := p.publishDirect(msg); err != nil {
			lastErr = err
			log.Printf("Publish attempt %d failed: %v", i+1, err)
			time.Sleep(time.Second)
			continue
		}
		return nil
	}
	
	return fmt.Errorf("failed after %d attempts: %v", maxRetries, lastErr)
}
