#!/usr/bin/env python3
import os
import base64
import hashlib
import json

def hash_password(password):
    # RabbitMQ SHA-256 password hashing
    salt = b'\x00' * 4  # RabbitMQ uses 4 null bytes as salt by default
    hash_obj = hashlib.sha256(salt + password.encode('utf-8'))
    return base64.b64encode(salt + hash_obj.digest()).decode('utf-8')

def generate_config():
    # Get environment variables or use defaults
    rabbitmq_user = os.environ.get('RABBITMQ_USER')
    rabbitmq_password = os.environ.get('RABBITMQ_PASSWORD')
    
    # Generate password hash
    password_hash = hash_password(rabbitmq_password)
    
    # Load template
    with open('/etc/rabbitmq/rabbitmq-definitions.template.json', 'r') as f:
        template_data = json.load(f)
    
    # Replace placeholders in users section
    for user in template_data.get('users', []):
        if user.get('name') == '{{RABBITMQ_USER}}':
            user['name'] = rabbitmq_user
        if user.get('password_hash') == '{{RABBITMQ_PASSWORD_HASH}}':
            user['password_hash'] = password_hash
    
    # Replace placeholders in permissions section
    for permission in template_data.get('permissions', []):
        if permission.get('user') == '{{RABBITMQ_USER}}':
            permission['user'] = rabbitmq_user
    
    # Write output to the correct location
    with open('/etc/rabbitmq/definitions.json', 'w') as f:
        json.dump(template_data, f, indent=2)
    
    print("RabbitMQ definitions file generated successfully at /etc/rabbitmq/definitions.json")

if __name__ == "__main__":
    generate_config()