#!/bin/sh

# Docker health check script for Task MCP HTTP Server
# This script checks the liveness endpoint

set -e

# Configuration
HOST="${HOST:-localhost}"
PORT="${PORT:-8443}"
SCHEME="${SCHEME:-https}"
TIMEOUT="${HEALTH_CHECK_TIMEOUT:-10}"
MAX_RETRIES=3

# Build the health check URL
URL="${SCHEME}://${HOST}:${PORT}/healthz"

# Function to perform health check
check_health() {
    local attempt=1
    
    while [ $attempt -le $MAX_RETRIES ]; do
        echo "Health check attempt $attempt/$MAX_RETRIES: $URL"
        
        # Perform the health check
        if curl -k -s -f --max-time "$TIMEOUT" \
            -H "User-Agent: docker-health-check/1.0" \
            "$URL" >/dev/null 2>&1; then
            echo "Health check passed on attempt $attempt"
            return 0
        fi
        
        echo "Health check failed on attempt $attempt"
        
        if [ $attempt -lt $MAX_RETRIES ]; then
            sleep 2
        fi
        
        attempt=$((attempt + 1))
    done
    
    echo "Health check failed after $MAX_RETRIES attempts"
    return 1
}

# Function to check if the process is responding
check_process() {
    # Check if the Node.js process is running
    if ! pgrep -f "node.*dist/index.js" >/dev/null; then
        echo "Node.js process not found"
        return 1
    fi
    
    # Check if the port is being listened on
    if ! netstat -tlnp 2>/dev/null | grep ":$PORT " >/dev/null; then
        echo "Port $PORT is not being listened on"
        return 1
    fi
    
    return 0
}

# Main health check logic
main() {
    echo "Starting health check for Task MCP HTTP Server"
    echo "URL: $URL"
    echo "Timeout: ${TIMEOUT}s"
    
    # First check if the process is running
    if ! check_process; then
        echo "Process check failed"
        exit 1
    fi
    
    # Then check the HTTP endpoint
    if check_health; then
        echo "Health check completed successfully"
        exit 0
    else
        echo "Health check failed"
        exit 1
    fi
}

# Run the health check
main "$@"