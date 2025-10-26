#!/bin/bash

# Basic Tool Execution Examples for Task MCP HTTP Server
# This script demonstrates how to execute tools using curl with both SSE and NDJSON transports

# Configuration
BASE_URL="http://localhost:8443"
AUTH_TOKEN="your-auth-token-here"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}→ $1${NC}"
}

# Test server connectivity
test_connectivity() {
    print_header "Testing Server Connectivity"
    
    if curl -s -f "$BASE_URL/healthz" > /dev/null; then
        print_success "Server is reachable"
    else
        print_error "Server is not reachable at $BASE_URL"
        exit 1
    fi
}

# SSE Tool Execution
execute_tool_sse() {
    local tool_name=$1
    local input_json=$2
    local description=$3
    
    print_header "SSE Tool Execution: $description"
    print_info "Tool: $tool_name"
    print_info "Input: $input_json"
    
    echo
    curl -X POST "$BASE_URL/sse" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -H "Accept: text/event-stream" \
        -d "$input_json" \
        -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"
    
    echo
}

# NDJSON Tool Execution
execute_tool_ndjson() {
    local tool_name=$1
    local input_json=$2
    local description=$3
    
    print_header "NDJSON Tool Execution: $description"
    print_info "Tool: $tool_name"
    print_info "Input: $input_json"
    
    echo
    curl -X POST "$BASE_URL/mcp" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -H "Accept: application/x-ndjson" \
        -d "$input_json" \
        -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"
    
    echo
}

# Health Check
health_check() {
    print_header "Health Check"
    
    response=$(curl -s "$BASE_URL/healthz")
    
    if echo "$response" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
        print_success "Server is healthy"
        echo "$response" | jq '.'
    else
        print_error "Server health check failed"
        echo "$response"
    fi
}

# Readiness Check
readiness_check() {
    print_header "Readiness Check"
    
    response=$(curl -s "$BASE_URL/readyz")
    
    if echo "$response" | jq -e '.ready == true' > /dev/null 2>&1; then
        print_success "Server is ready"
        echo "$response" | jq '.'
    else
        print_error "Server readiness check failed"
        echo "$response"
    fi
}

# Example 1: Get Active Changes
example_get_active_changes() {
    local input='{"tool":"changes.active","input":{"limit":10,"offset":0},"apiVersion":"1.0.0"}'
    
    execute_tool_sse "changes.active" "$input" "Get Active Changes (SSE)"
    execute_tool_ndjson "changes.active" "$input" "Get Active Changes (NDJSON)"
}

# Example 2: Create a Change
example_create_change() {
    local input='{
        "tool": "change.open",
        "input": {
            "title": "Example Feature Implementation",
            "slug": "example-feature-impl",
            "template": "feature",
            "rationale": "Example change created via curl",
            "owner": "dev-team"
        },
        "apiVersion": "1.0.0"
    }'
    
    execute_tool_sse "change.open" "$input" "Create Change (SSE)"
    execute_tool_ndjson "change.open" "$input" "Create Change (NDJSON)"
}

# Example 3: Archive a Change
example_archive_change() {
    local input='{
        "tool": "change.archive",
        "input": {
            "slug": "example-feature-impl"
        },
        "apiVersion": "1.0.0"
    }'
    
    execute_tool_sse "change.archive" "$input" "Archive Change (SSE)"
    execute_tool_ndjson "change.archive" "$input" "Archive Change (NDJSON)"
}

# Example 4: Error Handling - Invalid Tool
example_invalid_tool() {
    local input='{
        "tool": "nonexistent.tool",
        "input": {},
        "apiVersion": "1.0.0"
    }'
    
    execute_tool_sse "nonexistent.tool" "$input" "Invalid Tool (SSE)"
}

# Example 5: Error Handling - Invalid Input
example_invalid_input() {
    local input='{
        "tool": "change.open",
        "input": {
            "title": "",
            "slug": "invalid slug!",
            "template": "invalid"
        },
        "apiVersion": "1.0.0"
    }'
    
    execute_tool_sse "change.open" "$input" "Invalid Input (SSE)"
}

# Example 6: Performance Test
example_performance_test() {
    print_header "Performance Test - Multiple Concurrent Requests"
    
    local input='{"tool":"changes.active","input":{},"apiVersion":"1.0.0"}'
    local num_requests=5
    
    print_info "Sending $num_requests concurrent requests..."
    
    # Start time
    start_time=$(date +%s%N)
    
    # Send requests in background
    for i in $(seq 1 $num_requests); do
        {
            response=$(curl -s -X POST "$BASE_URL/sse" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $AUTH_TOKEN" \
                -H "Accept: text/event-stream" \
                -d "$input" \
                -w "%{http_code}")
            
            if [ "$response" = "200" ]; then
                echo "Request $i: SUCCESS"
            else
                echo "Request $i: FAILED ($response)"
            fi
        } &
    done
    
    # Wait for all background jobs
    wait
    
    # End time
    end_time=$(date +%s%N)
    duration=$((($end_time - $start_time) / 1000000))
    
    print_success "Completed $num_requests requests in ${duration}ms"
    print_info "Average: $((duration / num_requests))ms per request"
}

# Example 7: Rate Limiting Test
example_rate_limit_test() {
    print_header "Rate Limiting Test"
    
    local input='{"tool":"changes.active","input":{},"apiVersion":"1.0.0"}'
    
    print_info "Sending rapid requests to test rate limiting..."
    
    for i in {1..10}; do
        echo "Request $i:"
        curl -X POST "$BASE_URL/sse" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $AUTH_TOKEN" \
            -H "Accept: text/event-stream" \
            -d "$input" \
            -w "  Status: %{http_code}, Time: %{time_total}s\n" \
            -s -o /dev/null
        
        sleep 0.1
    done
}

# Example 8: Authentication Test
example_auth_test() {
    print_header "Authentication Test"
    
    local input='{"tool":"changes.active","input":{},"apiVersion":"1.0.0"}'
    
    print_info "Testing with invalid token..."
    
    curl -X POST "$BASE_URL/sse" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer invalid-token" \
        -H "Accept: text/event-stream" \
        -d "$input" \
        -w "\nStatus: %{http_code}\n" \
        -s
    
    echo
    
    print_info "Testing without token..."
    
    curl -X POST "$BASE_URL/sse" \
        -H "Content-Type: application/json" \
        -H "Accept: text/event-stream" \
        -d "$input" \
        -w "\nStatus: %{http_code}\n" \
        -s
    
    echo
}

# Example 9: Headers Test
example_headers_test() {
    print_header "Headers Test"
    
    print_info "Checking response headers..."
    
    curl -X POST "$BASE_URL/sse" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -H "Accept: text/event-stream" \
        -d '{"tool":"changes.active","input":{},"apiVersion":"1.0.0"}' \
        -I \
        -s
}

# Example 10: Timeout Test
example_timeout_test() {
    print_header "Timeout Test"
    
    local input='{"tool":"changes.active","input":{},"apiVersion":"1.0.0"}'
    
    print_info "Testing with 5 second timeout..."
    
    timeout 5s curl -X POST "$BASE_URL/sse" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -H "Accept: text/event-stream" \
        -d "$input" \
        -s
    
    if [ $? -eq 124 ]; then
        print_error "Request timed out as expected"
    else
        print_success "Request completed within timeout"
    fi
}

# Main execution
main() {
    echo "Task MCP HTTP Server - curl Examples"
    echo "======================================"
    echo "Base URL: $BASE_URL"
    echo "Auth Token: ${AUTH_TOKEN:0:10}..."
    echo
    
    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        print_error "jq is required for JSON parsing. Please install jq."
        exit 1
    fi
    
    # Test connectivity first
    test_connectivity
    
    # Run examples
    health_check
    readiness_check
    example_get_active_changes
    example_create_change
    example_archive_change
    example_invalid_tool
    example_invalid_input
    example_performance_test
    example_rate_limit_test
    example_auth_test
    example_headers_test
    example_timeout_test
    
    print_header "All Examples Completed"
    print_success "For more examples, see the documentation"
}

# Check if script is being sourced or executed
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi