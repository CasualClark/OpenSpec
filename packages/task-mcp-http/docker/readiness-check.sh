#!/bin/sh

# Docker readiness check script for Task MCP HTTP Server
# This script checks the readiness endpoint

set -e

# Configuration
HOST="${HOST:-localhost}"
PORT="${PORT:-8443}"
SCHEME="${SCHEME:-https}"
TIMEOUT="${READINESS_CHECK_TIMEOUT:-10}"
MAX_RETRIES=3

# Build the readiness check URL
URL="${SCHEME}://${HOST}:${PORT}/readyz"

# Function to perform readiness check
check_readiness() {
    local attempt=1
    
    while [ $attempt -le $MAX_RETRIES ]; do
        echo "Readiness check attempt $attempt/$MAX_RETRIES: $URL"
        
        # Perform the readiness check
        response=$(curl -k -s -w "%{http_code}" --max-time "$TIMEOUT" \
            -H "User-Agent: docker-readiness-check/1.0" \
            "$URL" 2>/dev/null)
        
        # Extract HTTP code from response
        http_code="${response##*}"
        response_body="${response%$http_code}"
        
        echo "HTTP Status Code: $http_code"
        echo "Response Body: $response_body"
        
        # Check if the response is successful (200) or service unavailable (503)
        case "$http_code" in
            200)
                echo "Readiness check passed on attempt $attempt"
                
                # Parse JSON response to check overall status
                if echo "$response_body" | jq -e '.status' >/dev/null 2>&1; then
                    status=$(echo "$response_body" | jq -r '.status')
                    echo "Service status: $status"
                    
                    if [ "$status" = "healthy" ] || [ "$status" = "degraded" ]; then
                        return 0
                    else
                        echo "Service reports unhealthy status: $status"
                    fi
                else
                    echo "Invalid JSON response, but HTTP status is OK"
                    return 0
                fi
                ;;
            503)
                echo "Service not ready on attempt $attempt (Service Unavailable)"
                ;;
            000)
                echo "Connection failed on attempt $attempt"
                ;;
            *)
                echo "Unexpected HTTP status $http_code on attempt $attempt"
                ;;
        esac
        
        if [ $attempt -lt $MAX_RETRIES ]; then
            echo "Waiting before next attempt..."
            sleep 3
        fi
        
        attempt=$((attempt + 1))
    done
    
    echo "Readiness check failed after $MAX_RETRIES attempts"
    return 1
}

# Function to check critical dependencies
check_dependencies() {
    echo "Checking critical dependencies..."
    
    # Check if critical health checks are passing
    response=$(curl -k -s --max-time "$TIMEOUT" \
        -H "User-Agent: docker-readiness-check/1.0" \
        "$URL" 2>/dev/null)
    
    if echo "$response" | jq -e '.checks' >/dev/null 2>&1; then
        # Check critical checks
        filesystem_status=$(echo "$response" | jq -r '.checks.filesystem // "unknown"')
        tools_status=$(echo "$response" | jq -r '.checks.toolRegistry // "unknown"')
        
        echo "Filesystem check: $filesystem_status"
        echo "Tool registry check: $tools_status"
        
        # If any critical check is failing, service is not ready
        if [ "$filesystem_status" = "fail" ] || [ "$tools_status" = "fail" ]; then
            echo "Critical dependency check failed"
            return 1
        fi
    fi
    
    return 0
}

# Function to check basic connectivity
check_connectivity() {
    echo "Checking basic connectivity..."
    
    # Simple TCP connection test
    if ! nc -z "$HOST" "$PORT" 2>/dev/null; then
        echo "Cannot connect to $HOST:$PORT"
        return 1
    fi
    
    return 0
}

# Main readiness check logic
main() {
    echo "Starting readiness check for Task MCP HTTP Server"
    echo "URL: $URL"
    echo "Timeout: ${TIMEOUT}s"
    
    # First check basic connectivity
    if ! check_connectivity; then
        echo "Connectivity check failed"
        exit 1
    fi
    
    # Then check the HTTP endpoint
    if check_readiness; then
        # Finally check critical dependencies
        if check_dependencies; then
            echo "Readiness check completed successfully"
            exit 0
        else
            echo "Readiness check failed - dependencies not ready"
            exit 1
        fi
    else
        echo "Readiness check failed"
        exit 1
    fi
}

# Run the readiness check
main "$@"