#!/bin/bash

# Task MCP HTTP Server - Health Check Script
# Used by Docker containers and Kubernetes for health checks

set -euo pipefail

# Configuration
HOST="${HOST:-localhost}"
PORT="${PORT:-3000}"
TIMEOUT="${TIMEOUT:-5}"
ENDPOINT="${ENDPOINT:-/healthz}"
PROTOCOL="${PROTOCOL:-http}"

# Colors for output (only when not in container)
if [[ -t 1 && "${CONTAINER_MODE:-false}" != "true" ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --host)
            HOST="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --endpoint)
            ENDPOINT="$2"
            shift 2
            ;;
        --protocol)
            PROTOCOL="$2"
            shift 2
            ;;
        --container)
            CONTAINER_MODE="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --host <host>        Host to check (default: localhost)"
            echo "  --port <port>        Port to check (default: 3000)"
            echo "  --timeout <seconds>  Request timeout (default: 5)"
            echo "  --endpoint <path>    Health endpoint (default: /healthz)"
            echo "  --protocol <proto>   Protocol (http/https, default: http)"
            echo "  --container          Container mode (no colors, exit codes only)"
            echo "  --help               Show this help message"
            echo ""
            echo "Exit Codes:"
            echo "  0  Healthy"
            echo "  1  Unhealthy"
            echo "  2  Misconfiguration"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 2
            ;;
    esac
done

# Build URL
URL="${PROTOCOL}://${HOST}:${PORT}${ENDPOINT}"

# Function to check health
check_health() {
    local url="$1"
    local timeout="$2"
    
    # Use curl for health check
    if command -v curl &> /dev/null; then
        # curl options:
        # -f: Fail silently on server errors
        # -s: Silent mode
        # -S: Show error when silent mode is used
        # -L: Follow redirects
        # -m: Maximum time allowed for operation
        # -o: Output file (discard output)
        # -w: Write out format
        curl_output=$(curl -fsSL -m "$timeout" -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
        curl_exit_code=$?
        
        if [[ $curl_exit_code -eq 0 ]]; then
            if [[ "$curl_output" =~ ^2[0-9][0-9]$ ]]; then
                return 0  # Healthy
            else
                return 1  # Unhealthy (non-2xx response)
            fi
        else
            return 1  # Unhealthy (curl failed)
        fi
    elif command -v wget &> /dev/null; then
        # Fallback to wget
        if wget --timeout="$timeout" --tries=1 --quiet --spider "$url" 2>/dev/null; then
            return 0  # Healthy
        else
            return 1  # Unhealthy
        fi
    else
        # No HTTP client available
        if [[ "${CONTAINER_MODE:-false}" == "true" ]]; then
            echo "Error: No HTTP client available" >&2
        fi
        return 2  # Misconfiguration
    fi
}

# Perform health check
if [[ "${CONTAINER_MODE:-false}" == "true" ]]; then
    # Container mode - silent operation, only exit codes
    check_health "$URL" "$TIMEOUT"
    exit $?
else
    # Interactive mode - show output
    echo -e "${BLUE}Health Check${NC}"
    echo -e "${BLUE}============${NC}"
    echo -e "URL: ${GREEN}$URL${NC}"
    echo -e "Timeout: ${GREEN}${TIMEOUT}s${NC}"
    echo ""
    
    echo -e "${YELLOW}Checking health...${NC}"
    
    if check_health "$URL" "$TIMEOUT"; then
        echo -e "${GREEN}✓ Service is healthy${NC}"
        
        # Try to get detailed health info
        echo ""
        echo -e "${BLUE}Health Details${NC}"
        echo -e "${BLUE}==============${NC}"
        
        if command -v curl &> /dev/null; then
            health_info=$(curl -fsSL -m "$timeout" "$URL" 2>/dev/null || echo '{"error":"Failed to get health details"}')
            
            # Try to pretty print JSON
            if command -v jq &> /dev/null; then
                echo "$health_info" | jq . 2>/dev/null || echo "$health_info"
            else
                echo "$health_info"
            fi
        fi
        
        exit 0
    else
        echo -e "${RED}✗ Service is unhealthy${NC}"
        
        # Try to diagnose the issue
        echo ""
        echo -e "${YELLOW}Diagnosis${NC}"
        echo -e "${YELLOW}=========${NC}"
        
        # Check if port is open
        if command -v nc &> /dev/null; then
            if nc -z -w "$TIMEOUT" "$HOST" "$PORT" 2>/dev/null; then
                echo -e "${GREEN}✓ Port $PORT is open${NC}"
            else
                echo -e "${RED}✗ Port $PORT is closed or not reachable${NC}"
            fi
        elif command -v telnet &> /dev/null; then
            if timeout "$TIMEOUT" telnet "$HOST" "$PORT" </dev/null 2>/dev/null | grep -q "Connected"; then
                echo -e "${GREEN}✓ Port $PORT is open${NC}"
            else
                echo -e "${RED}✗ Port $PORT is closed or not reachable${NC}"
            fi
        fi
        
        # Check if host is reachable
        if command -v ping &> /dev/null; then
            if ping -c 1 -W "$TIMEOUT" "$HOST" >/dev/null 2>&1; then
                echo -e "${GREEN}✓ Host $HOST is reachable${NC}"
            else
                echo -e "${RED}✗ Host $HOST is not reachable${NC}"
            fi
        fi
        
        exit 1
    fi
fi