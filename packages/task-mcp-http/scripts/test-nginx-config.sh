#!/bin/bash

# Nginx Configuration Testing Script
# Tests and validates Nginx configuration for Task MCP HTTP Server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration paths
NGINX_CONF="/etc/nginx/nginx.conf"
CONF_D_DIR="/etc/nginx/conf.d"
SITES_DIR="/etc/nginx/sites-available"
SSL_DIR="/etc/nginx/ssl"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Test basic Nginx configuration
test_nginx_syntax() {
    log "Testing Nginx configuration syntax..."
    
    if nginx -t > /dev/null 2>&1; then
        log_success "Nginx configuration syntax is valid"
    else
        log_error "Nginx configuration syntax is invalid"
        nginx -t
        return 1
    fi
}

# Test configuration file existence
test_config_files() {
    log "Testing configuration file existence..."
    
    local required_files=(
        "$NGINX_CONF"
        "$CONF_D_DIR/upstream.conf"
        "$CONF_D_DIR/ssl.conf"
        "$CONF_D_DIR/security.conf"
        "$CONF_D_DIR/sse.conf"
        "$CONF_D_DIR/logging.conf"
        "$SITES_DIR/task-mcp-dev.conf"
        "$SITES_DIR/task-mcp-staging.conf"
        "$SITES_DIR/task-mcp-prod.conf"
    )
    
    for file in "${required_files[@]}"; do
        if [[ -f "$file" ]]; then
            log_success "Configuration file exists: $file"
        else
            log_error "Configuration file missing: $file"
        fi
    done
}

# Test SSL certificates
test_ssl_certificates() {
    log "Testing SSL certificates..."
    
    local cert_files=(
        "$SSL_DIR/task-mcp-server.crt"
        "$SSL_DIR/task-mcp-server.key"
    )
    
    for cert_file in "${cert_files[@]}"; do
        if [[ -f "$cert_file" ]]; then
            log_success "SSL certificate exists: $cert_file"
            
            # Test certificate validity
            if [[ "$cert_file" == *.crt ]]; then
                if openssl x509 -in "$cert_file" -noout -checkend 86400 > /dev/null 2>&1; then
                    log_success "SSL certificate is valid (expires in > 24h): $cert_file"
                else
                    log_warning "SSL certificate expires soon or is invalid: $cert_file"
                fi
            fi
        else
            log_warning "SSL certificate missing: $cert_file"
        fi
    done
}

# Test upstream configuration
test_upstream_config() {
    log "Testing upstream configuration..."
    
    if [[ -f "$CONF_D_DIR/upstream.conf" ]]; then
        # Check for required upstream blocks
        if grep -q "upstream task_mcp_backend" "$CONF_D_DIR/upstream.conf"; then
            log_success "Main upstream block found"
        else
            log_error "Main upstream block missing"
        fi
        
        if grep -q "upstream task_mcp_sse_backend" "$CONF_D_DIR/upstream.conf"; then
            log_success "SSE upstream block found"
        else
            log_error "SSE upstream block missing"
        fi
        
        # Check for backend servers
        if grep -q "server 127.0.0.1:3000" "$CONF_D_DIR/upstream.conf"; then
            log_success "Backend server configuration found"
        else
            log_error "Backend server configuration missing"
        fi
    else
        log_error "Upstream configuration file missing"
    fi
}

# Test SSL configuration
test_ssl_config() {
    log "Testing SSL configuration..."
    
    if [[ -f "$CONF_D_DIR/ssl.conf" ]]; then
        # Check for TLS 1.3
        if grep -q "TLSv1.3" "$CONF_D_DIR/ssl.conf"; then
            log_success "TLS 1.3 enabled"
        else
            log_warning "TLS 1.3 not found in configuration"
        fi
        
        # Check for modern cipher suites
        if grep -q "TLS_AES_256_GCM_SHA384" "$CONF_D_DIR/ssl.conf"; then
            log_success "Modern cipher suites configured"
        else
            log_warning "Modern cipher suites not found"
        fi
        
        # Check for HSTS
        if grep -q "Strict-Transport-Security" "$CONF_D_DIR/ssl.conf"; then
            log_success "HSTS configured"
        else
            log_warning "HSTS not configured"
        fi
        
        # Check for OCSP stapling
        if grep -q "ssl_stapling" "$CONF_D_DIR/ssl.conf"; then
            log_success "OCSP stapling configured"
        else
            log_warning "OCSP stapling not configured"
        fi
    else
        log_error "SSL configuration file missing"
    fi
}

# Test security configuration
test_security_config() {
    log "Testing security configuration..."
    
    if [[ -f "$CONF_D_DIR/security.conf" ]]; then
        # Check for security headers
        local security_headers=(
            "X-Frame-Options"
            "X-Content-Type-Options"
            "X-XSS-Protection"
            "Content-Security-Policy"
        )
        
        for header in "${security_headers[@]}"; do
            if grep -q "$header" "$CONF_D_DIR/security.conf"; then
                log_success "Security header found: $header"
            else
                log_warning "Security header missing: $header"
            fi
        done
        
        # Check for rate limiting
        if grep -q "limit_req_zone" "$CONF_D_DIR/security.conf"; then
            log_success "Rate limiting configured"
        else
            log_warning "Rate limiting not found"
        fi
        
        # Check for connection limiting
        if grep -q "limit_conn_zone" "$CONF_D_DIR/security.conf"; then
            log_success "Connection limiting configured"
        else
            log_warning "Connection limiting not found"
        fi
    else
        log_error "Security configuration file missing"
    fi
}

# Test SSE configuration
test_sse_config() {
    log "Testing SSE configuration..."
    
    if [[ -f "$CONF_D_DIR/sse.conf" ]]; then
        # Check for SSE-specific settings
        local sse_settings=(
            "proxy_buffering off"
            "proxy_cache off"
            "X-Accel-Buffering no"
            "proxy_send_timeout"
            "proxy_read_timeout"
        )
        
        for setting in "${sse_settings[@]}"; do
            if grep -q "$setting" "$CONF_D_DIR/sse.conf"; then
                log_success "SSE setting found: $setting"
            else
                log_warning "SSE setting missing: $setting"
            fi
        done
        
        # Check for SSE location block
        if grep -q "location /sse" "$CONF_D_DIR/sse.conf"; then
            log_success "SSE location block found"
        else
            log_error "SSE location block missing"
        fi
    else
        log_error "SSE configuration file missing"
    fi
}

# Test logging configuration
test_logging_config() {
    log "Testing logging configuration..."
    
    if [[ -f "$CONF_D_DIR/logging.conf" ]]; then
        # Check for log formats
        if grep -q "log_format" "$CONF_D_DIR/logging.conf"; then
            log_success "Custom log formats found"
        else
            log_warning "Custom log formats not found"
        fi
        
        # Check for JSON logging
        if grep -q "json_main" "$CONF_D_DIR/logging.conf"; then
            log_success "JSON log format found"
        else
            log_warning "JSON log format not found"
        fi
        
        # Check for SSE-specific logging
        if grep -q "sse_main" "$CONF_D_DIR/logging.conf"; then
            log_success "SSE log format found"
        else
            log_warning "SSE log format not found"
        fi
    else
        log_error "Logging configuration file missing"
    fi
}

# Test site configurations
test_site_configs() {
    log "Testing site configurations..."
    
    local sites=("task-mcp-dev" "task-mcp-staging" "task-mcp-prod")
    
    for site in "${sites[@]}"; do
        local site_config="$SITES_DIR/$site.conf"
        
        if [[ -f "$site_config" ]]; then
            log_success "Site configuration exists: $site"
            
            # Check for server block
            if grep -q "server {" "$site_config"; then
                log_success "Server block found in $site"
            else
                log_error "Server block missing in $site"
            fi
            
            # Check for listen directive
            if grep -q "listen" "$site_config"; then
                log_success "Listen directive found in $site"
            else
                log_error "Listen directive missing in $site"
            fi
            
            # Check for proxy_pass
            if grep -q "proxy_pass" "$site_config"; then
                log_success "Proxy pass found in $site"
            else
                log_warning "Proxy pass not found in $site"
            fi
        else
            log_error "Site configuration missing: $site"
        fi
    done
}

# Test backend connectivity
test_backend_connectivity() {
    log "Testing backend connectivity..."
    
    local backends=("127.0.0.1:3000" "127.0.0.1:3001" "127.0.0.1:3002")
    
    for backend in "${backends[@]}"; do
        if curl -f -s --max-time 5 "http://$backend/healthz" > /dev/null 2>&1; then
            log_success "Backend is reachable: $backend"
        else
            log_warning "Backend not reachable: $backend"
        fi
    done
}

# Test SSL configuration with external tools
test_ssl_external() {
    log "Testing SSL with external validation..."
    
    # Only test if SSL certificates exist
    if [[ -f "$SSL_DIR/task-mcp-server.crt" ]]; then
        # Test certificate with OpenSSL
        if openssl x509 -in "$SSL_DIR/task-mcp-server.crt" -text -noout > /dev/null 2>&1; then
            log_success "Certificate is valid OpenSSL format"
        else
            log_error "Certificate is invalid OpenSSL format"
        fi
        
        # Test key matches certificate
        if openssl rsa -in "$SSL_DIR/task-mcp-server.key" -pubout -outform PEM 2>/dev/null | \
           openssl x509 -in "$SSL_DIR/task-mcp-server.crt" -pubkey -noout -pubin -outform PEM 2>/dev/null | \
           diff - > /dev/null 2>&1; then
            log_success "Certificate and key match"
        else
            log_error "Certificate and key do not match"
        fi
    fi
}

# Performance recommendations
check_performance_settings() {
    log "Checking performance settings..."
    
    # Check worker processes
    if grep -q "worker_processes auto" "$NGINX_CONF"; then
        log_success "Worker processes set to auto"
    else
        log_warning "Worker processes not set to auto"
    fi
    
    # Check worker connections
    if grep -q "worker_connections" "$NGINX_CONF"; then
        local connections=$(grep "worker_connections" "$NGINX_CONF" | awk '{print $2}')
        if [[ $connections -ge 1024 ]]; then
            log_success "Worker connections configured: $connections"
        else
            log_warning "Worker connections might be too low: $connections"
        fi
    fi
    
    # Check for gzip
    if grep -q "gzip on" "$NGINX_CONF"; then
        log_success "Gzip compression enabled"
    else
        log_warning "Gzip compression not enabled"
    fi
    
    # Check for keepalive
    if grep -q "keepalive_timeout" "$NGINX_CONF"; then
        log_success "Keep-alive timeout configured"
    else
        log_warning "Keep-alive timeout not configured"
    fi
}

# Generate test report
generate_report() {
    echo ""
    echo "==================================="
    echo "Nginx Configuration Test Report"
    echo "==================================="
    echo "Tests Passed:  $TESTS_PASSED"
    echo "Tests Failed:  $TESTS_FAILED"
    echo "Total Tests:   $((TESTS_PASSED + TESTS_FAILED))"
    echo ""
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        echo "Nginx configuration is ready for deployment."
    else
        echo -e "${RED}Some tests failed.${NC}"
        echo "Please review and fix the issues before deployment."
    fi
    
    echo "==================================="
}

# Main execution
main() {
    echo "Starting Nginx configuration tests..."
    echo ""
    
    # Run all tests
    test_nginx_syntax
    test_config_files
    test_ssl_certificates
    test_upstream_config
    test_ssl_config
    test_security_config
    test_sse_config
    test_logging_config
    test_site_configs
    test_backend_connectivity
    test_ssl_external
    check_performance_settings
    
    # Generate report
    generate_report
    
    # Exit with appropriate code
    if [[ $TESTS_FAILED -eq 0 ]]; then
        exit 0
    else
        exit 1
    fi
}

# Check if running as root for system tests
if [[ $EUID -ne 0 ]]; then
    log_warning "Some tests require root privileges. Consider running with sudo."
fi

# Run main function
main "$@"