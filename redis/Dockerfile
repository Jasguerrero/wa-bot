FROM redis:8.0-rc1-alpine3.21

# Copy custom configuration if needed
COPY redis.conf /usr/local/etc/redis/redis.conf

# Set permissions
RUN chmod 644 /usr/local/etc/redis/redis.conf

# Expose Redis port
EXPOSE 6379

# Start Redis with the custom config
CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
