FROM rabbitmq:3.12-management

# Install Python for our configuration script
RUN apt-get update && apt-get install -y python3 && apt-get clean

# Copy the template file and script
COPY rabbitmq-definitions.template.json /etc/rabbitmq/rabbitmq-definitions.template.json
COPY rabbitmq/generate-config.py /usr/local/bin/generate-config.py
RUN chmod +x /usr/local/bin/generate-config.py

# Create a config file to load the definitions
RUN echo 'management.load_definitions = /etc/rabbitmq/definitions.json' > /etc/rabbitmq/conf.d/management_load_definitions.conf

# Create a startup script
COPY rabbitmq/docker-entrypoint-wrapper.sh /usr/local/bin/docker-entrypoint-wrapper.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-wrapper.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint-wrapper.sh"]
CMD ["rabbitmq-server"]