#!/bin/bash

# Task MCP HTTP Server - Dockerless Native Runner
# Supports Node.js and Bun with TLS management and process monitoring

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
NODE_ENV="${NODE_ENV:-production}"
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
RUNTIME="${RUNTIME:-node}"  # node or bun
USE_PM2="${USE_PM2:-false}"
LOG_LEVEL="${LOG_LEVEL:-info}"
WORKING_DIR="${WORKING_DIR:-$(pwd)}"
CONFIG_FILE="${CONFIG_FILE:-}"
ENV_FILE="${ENV_FILE:-.env}"

# TLS configuration
TLS_ENABLED="${TLS_ENABLED:-false}"
TLS_KEY="${TLS_KEY:-}"
TLS_CERT="${TLS_CERT:-}"
TLS_CA="${TLS_CA:-}"
TLS_AUTO_CERT="${TLS_AUTO_CERT:-false}"

# PM2 configuration
PM2_NAME="${PM2_NAME:-task-mcp-http}"
PM2_INSTANCES="${PM2_INSTANCES:-1}"
PM2_MAX_MEMORY_RESTART="${PM2_MAX_MEMORY_RESTART:-512M}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --runtime)
            RUNTIME="$2"
            shift 2
            ;;
        --pm2)
            USE_PM2="true"
            shift
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --host)
            HOST="$2"
            shift 2
            ;;
        --env)
            ENV_FILE="$2"
            shift 2
            ;;
        --config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        --tls)
            TLS_ENABLED="true"
            TLS_KEY="$2"
            TLS_CERT="$3"
            shift 3
            ;;
        --auto-tls)
            TLS_AUTO_CERT="true"
            shift
            ;;
        --dev)
            NODE_ENV="development"
            LOG_LEVEL="debug"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --runtime <node|bun>    Runtime to use (default: node)"
            echo "  --pm2                    Use PM2 for process management"
            echo "  --port <port>            Port to listen on (default: 3000)"
            echo "  --host <host>            Host to bind to (default: 0.0.0.0)"
            echo "  --env <file>             Environment file (default: .env)"
            echo "  --config <file>          Configuration file"
            echo "  --tls <key> <cert>       Enable TLS with key and cert files"
            echo "  --auto-tls               Generate self-signed certificate"
            echo "  --dev                    Development mode"
            echo "  --help                   Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  NODE_ENV                 Environment (default: production)"
            echo "  PORT                     Port (default: 3000)"
            echo "  HOST                     Host (default: 0.0.0.0)"
            echo "  RUNTIME                  Runtime (default: node)"
            echo "  USE_PM2                  Use PM2 (default: false)"
            echo "  LOG_LEVEL                Log level (default: info)"
            echo "  TLS_ENABLED              Enable TLS (default: false)"
            echo "  TLS_KEY                  TLS key file"
            echo "  TLS_CERT                 TLS certificate file"
            echo "  PM2_NAME                 PM2 process name"
            echo "  PM2_INSTANCES            PM2 instances (default: 1)"
            echo "  PM2_MAX_MEMORY_RESTART   PM2 memory restart threshold"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Print configuration
echo -e "${BLUE}Task MCP HTTP Server - Native Runner${NC}"
echo -e "${BLUE}===================================${NC}"
echo -e "Runtime: ${GREEN}${RUNTIME}${NC}"
echo -e "Environment: ${GREEN}${NODE_ENV}${NC}"
echo -e "Port: ${GREEN}${PORT}${NC}"
echo -e "Host: ${GREEN}${HOST}${NC}"
echo -e "Process Manager: ${GREEN}${USE_PM2:+PM2}${NC}"
echo -e "Working Directory: ${GREEN}${WORKING_DIR}${NC}"
echo -e "TLS: ${GREEN}${TLS_ENABLED}${NC}"
echo ""

# Change to working directory
cd "$WORKING_DIR"

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if runtime is available
if [[ "$RUNTIME" == "bun" ]]; then
    if ! command -v bun &> /dev/null; then
        echo -e "${RED}Error: Bun is not installed or not in PATH${NC}"
        echo -e "${YELLOW}Install Bun: curl -fsSL https://bun.sh/install | bash${NC}"
        exit 1
    fi
else
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed or not in PATH${NC}"
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version | sed 's/v//')
    REQUIRED_VERSION="20.19.0"
    if ! node -e "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION') ? 0 : 1)" 2>/dev/null; then
        echo -e "${RED}Error: Node.js version $NODE_VERSION is too old. Required: >= $REQUIRED_VERSION${NC}"
        exit 1
    fi
fi

# Check if PM2 is available when requested
if [[ "$USE_PM2" == "true" ]] && ! command -v pm2 &> /dev/null; then
    echo -e "${RED}Error: PM2 is not installed or not in PATH${NC}"
    echo -e "${YELLOW}Install PM2: npm install -g pm2${NC}"
    exit 1
fi

# Check if OpenSSL is available for TLS
if [[ "$TLS_ENABLED" == "true" ]] || [[ "$TLS_AUTO_CERT" == "true" ]]; then
    if ! command -v openssl &> /dev/null; then
        echo -e "${RED}Error: OpenSSL is not installed or not in PATH${NC}"
        exit 1
    fi
fi

# Load environment file
if [[ -f "$ENV_FILE" ]]; then
    echo -e "${YELLOW}Loading environment from $ENV_FILE...${NC}"
    set -a
    source "$ENV_FILE"
    set +a
fi

# Create necessary directories
mkdir -p logs ssl

# Generate self-signed certificate if requested
if [[ "$TLS_AUTO_CERT" == "true" ]]; then
    echo -e "${YELLOW}Generating self-signed certificate...${NC}"
    TLS_KEY="ssl/server.key"
    TLS_CERT="ssl/server.crt"
    
    openssl req -x509 -newkey rsa:4096 -keyout "$TLS_KEY" -out "$TLS_CERT" -days 365 -nodes \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" 2>/dev/null
    
    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✓ Self-signed certificate generated${NC}"
        TLS_ENABLED="true"
    else
        echo -e "${RED}Error: Failed to generate certificate${NC}"
        exit 1
    fi
fi

# Verify TLS files if TLS is enabled
if [[ "$TLS_ENABLED" == "true" ]]; then
    if [[ ! -f "$TLS_KEY" ]]; then
        echo -e "${RED}Error: TLS key file not found: $TLS_KEY${NC}"
        exit 1
    fi
    
    if [[ ! -f "$TLS_CERT" ]]; then
        echo -e "${RED}Error: TLS certificate file not found: $TLS_CERT${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ TLS files verified${NC}"
fi

# Install dependencies if needed
if [[ ! -d "node_modules" ]] || [[ ! -f "package-lock.json" ]] && [[ ! -f "pnpm-lock.yaml" ]]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    if [[ "$RUNTIME" == "bun" ]]; then
        bun install
    else
        npm install
    fi
fi

# Build the application
if [[ "$NODE_ENV" == "production" ]] || [[ ! -d "dist" ]]; then
    echo -e "${YELLOW}Building application...${NC}"
    if [[ "$RUNTIME" == "bun" ]]; then
        bun run build
    else
        npm run build
    fi
fi

# Prepare environment variables
ENV_VARS=(
    "NODE_ENV=$NODE_ENV"
    "PORT=$PORT"
    "HOST=$HOST"
    "LOG_LEVEL=$LOG_LEVEL"
)

if [[ "$TLS_ENABLED" == "true" ]]; then
    ENV_VARS+=("TLS_KEY=$TLS_KEY")
    ENV_VARS+=("TLS_CERT=$TLS_CERT")
    
    if [[ -n "$TLS_CA" ]]; then
        ENV_VARS+=("TLS_CA=$TLS_CA")
    fi
fi

# Export environment variables
export "${ENV_VARS[@]}"

# Prepare command
if [[ "$NODE_ENV" == "development" ]]; then
    CMD=("npm" "run" "start:dev")
else
    CMD=("node" "dist/index.js")
    if [[ "$RUNTIME" == "bun" ]]; then
        CMD=("bun" "dist/index.js")
    fi
fi

# Start the server
echo -e "${YELLOW}Starting server...${NC}"

if [[ "$USE_PM2" == "true" ]]; then
    echo -e "${BLUE}Starting with PM2...${NC}"
    
    # Prepare PM2 configuration
    PM2_CONFIG=(
        "--name" "$PM2_NAME"
        "--instances" "$PM2_INSTANCES"
        "--max-memory-restart" "$PM2_MAX_MEMORY_RESTART"
        "--log" "logs/pm2.log"
        "--out" "logs/pm2-out.log"
        "--error" "logs/pm2-error.log"
        "--time"
        "--merge-logs"
    )
    
    # Add environment variables
    for var in "${ENV_VARS[@]}"; do
        PM2_CONFIG+=("--env" "$var")
    done
    
    # Stop existing process if running
    if pm2 list | grep -q "$PM2_NAME"; then
        echo -e "${YELLOW}Stopping existing process...${NC}"
        pm2 stop "$PM2_NAME" || true
        pm2 delete "$PM2_NAME" || true
    fi
    
    # Start with PM2
    if pm2 start "${CMD[@]}" "${PM2_CONFIG[@]}"; then
        echo -e "${GREEN}✓ Server started with PM2${NC}"
        echo -e "${BLUE}Process name: ${GREEN}$PM2_NAME${NC}"
        echo -e "${BLUE}Instances: ${GREEN}$PM2_INSTANCES${NC}"
        echo -e "${BLUE}Status: ${GREEN}$(pm2 jlist | jq -r ".[] | select(.name==\"$PM2_NAME\") | .pm2_env.status")${NC}"
        
        # Save PM2 configuration
        pm2 save
        
        echo -e "${YELLOW}Useful PM2 commands:${NC}"
        echo -e "  pm2 logs $PM2_NAME     # View logs"
        echo -e "  pm2 monit              # Monitor dashboard"
        echo -e "  pm2 restart $PM2_NAME  # Restart"
        echo -e "  pm2 stop $PM2_NAME     # Stop"
        echo -e "  pm2 delete $PM2_NAME   # Delete"
    else
        echo -e "${RED}Error: Failed to start server with PM2${NC}"
        exit 1
    fi
else
    echo -e "${BLUE}Starting server directly...${NC}"
    
    # Start directly
    if "${CMD[@]}"; then
        echo -e "${GREEN}✓ Server started successfully${NC}"
    else
        echo -e "${RED}Error: Failed to start server${NC}"
        exit 1
    fi
fi

# Print server information
echo ""
echo -e "${BLUE}Server Information${NC}"
echo -e "${BLUE}==================${NC}"

if [[ "$TLS_ENABLED" == "true" ]]; then
    PROTOCOL="https"
else
    PROTOCOL="http"
fi

echo -e "URL: ${GREEN}${PROTOCOL}://${HOST}:${PORT}${NC}"
echo -e "Health: ${GREEN}${PROTOCOL}://${HOST}:${PORT}/healthz${NC}"
echo -e "Ready: ${GREEN}${PROTOCOL}://${HOST}:${PORT}/readyz${NC}"

if [[ "$TLS_ENABLED" == "true" ]]; then
    echo ""
    echo -e "${YELLOW}TLS Information${NC}"
    echo -e "Key: ${GREEN}$TLS_KEY${NC}"
    echo -e "Certificate: ${GREEN}$TLS_CERT${NC}"
fi

if [[ "$USE_PM2" == "true" ]]; then
    echo ""
    echo -e "${YELLOW}PM2 Information${NC}"
    echo -e "Process ID: ${GREEN}$(pm2 jlist | jq -r ".[] | select(.name==\"$PM2_NAME\") | .pm_id")${NC}"
    echo -e "Status: ${GREEN}$(pm2 jlist | jq -r ".[] | select(.name==\"$PM2_NAME\") | .pm2_env.status")${NC}"
fi

echo ""
echo -e "${GREEN}✓ Server is running!${NC}"