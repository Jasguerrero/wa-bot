#!/bin/bash
set -e

# Generate the definitions file
echo "Generating RabbitMQ definitions file..."
python3 /usr/local/bin/generate-config.py

# Make sure the file has the right permissions
chmod 644 /etc/rabbitmq/definitions.json

# Show the generated config for debugging
echo "Generated definitions file:"
cat /etc/rabbitmq/definitions.json

# Now run the original entrypoint with all arguments
exec docker-entrypoint.sh "$@"