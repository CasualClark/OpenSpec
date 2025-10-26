#!/bin/bash

# Task MCP HTTP Server - Dependency Installation Script
# Installs runtime dependencies and development tools

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
RUNTIME="${RUNTIME:-node}"
DEV_TOOLS="${DEV_TOOLS:-true}"
GLOBAL_TOOLS="${GLOBAL_TOOLS:-true}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --runtime)
            RUNTIME="$2"
            shift 2
            ;;
        --no-dev-tools)
            DEV_TOOLS="false"
            shift
            ;;
        --no-global)
            GLOBAL_TOOLS="false"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --runtime <node|bun>  Runtime to use (default: node)"
            echo "  --no-dev-tools         Skip development tools installation"
            echo "  --no-global            Skip global tools installation"
            echo "  --help                 Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  RUNTIME                Runtime to use (default: node)"
            echo "  DEV_TOOLS              Install dev tools (default: true)"
            echo "  GLOBAL_TOOLS           Install global tools (default: true)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}Task MCP HTTP Server - Dependency Installation${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "Runtime: ${GREEN}${RUNTIME}${NC}"
echo -e "Dev Tools: ${GREEN}${DEV_TOOLS}${NC}"
echo -e "Global Tools: ${GREEN}${GLOBAL_TOOLS}${NC}"
echo ""

# Function to install Node.js
install_nodejs() {
    echo -e "${YELLOW}Installing Node.js...${NC}"
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        echo -e "${GREEN}✓ Node.js already installed: $NODE_VERSION${NC}"
        return
    fi
    
    # Detect OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            # Ubuntu/Debian
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v yum &> /dev/null; then
            # CentOS/RHEL
            curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
            sudo yum install -y nodejs npm
        elif command -v dnf &> /dev/null; then
            # Fedora
            curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
            sudo dnf install -y nodejs npm
        else
            echo -e "${RED}Error: Unsupported Linux distribution${NC}"
            echo -e "${YELLOW}Please install Node.js manually: https://nodejs.org/${NC}"
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install node
        else
            echo -e "${RED}Error: Homebrew not found${NC}"
            echo -e "${YELLOW}Please install Homebrew first: https://brew.sh/${NC}"
            exit 1
        fi
    else
        echo -e "${RED}Error: Unsupported operating system${NC}"
        echo -e "${YELLOW}Please install Node.js manually: https://nodejs.org/${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Node.js installed successfully${NC}"
}

# Function to install Bun
install_bun() {
    echo -e "${YELLOW}Installing Bun...${NC}"
    
    if command -v bun &> /dev/null; then
        BUN_VERSION=$(bun --version)
        echo -e "${GREEN}✓ Bun already installed: $BUN_VERSION${NC}"
        return
    fi
    
    # Install Bun using official installer
    curl -fsSL https://bun.sh/install | bash
    
    # Add Bun to PATH for current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    
    echo -e "${GREEN}✓ Bun installed successfully${NC}"
    echo -e "${YELLOW}Please add the following to your shell profile:${NC}"
    echo -e "export BUN_INSTALL=\"\$HOME/.bun\""
    echo -e "export PATH=\"\$BUN_INSTALL/bin:\$PATH\""
}

# Function to install global tools
install_global_tools() {
    echo -e "${YELLOW}Installing global tools...${NC}"
    
    local tools=(
        "pm2"
        "typescript"
        "ts-node"
        "nodemon"
    )
    
    for tool in "${tools[@]}"; do
        echo -e "${BLUE}Installing $tool...${NC}"
        if [[ "$RUNTIME" == "bun" ]]; then
            bun add -g "$tool"
        else
            npm install -g "$tool"
        fi
    done
    
    # Install security tools
    echo -e "${BLUE}Installing security tools...${NC}"
    
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y openssl curl wget jq
    elif command -v yum &> /dev/null || command -v dnf &> /dev/null; then
        sudo yum install -y openssl curl wget jq || sudo dnf install -y openssl curl wget jq
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install openssl curl wget jq
        fi
    fi
    
    # Install Trivy for security scanning
    if ! command -v trivy &> /dev/null; then
        echo -e "${YELLOW}Installing Trivy for security scanning...${NC}"
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            sudo apt-get install wget apt-transport-https gnupg lsb-release
            wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
            echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
            sudo apt-get update
            sudo apt-get install trivy
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            if command -v brew &> /dev/null; then
                brew install trivy
            fi
        fi
    fi
    
    # Install Syft for SBOM generation
    if ! command -v syft &> /dev/null; then
        echo -e "${YELLOW}Installing Syft for SBOM generation...${NC}"
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            if command -v brew &> /dev/null; then
                brew install syft
            fi
        fi
    fi
    
    echo -e "${GREEN}✓ Global tools installed successfully${NC}"
}

# Function to install project dependencies
install_project_deps() {
    echo -e "${YELLOW}Installing project dependencies...${NC}"
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        echo -e "${RED}Error: package.json not found${NC}"
        exit 1
    fi
    
    # Install dependencies
    if [[ "$RUNTIME" == "bun" ]]; then
        bun install
    else
        # Use pnpm if lockfile exists, otherwise npm
        if [[ -f "pnpm-lock.yaml" ]]; then
            if ! command -v pnpm &> /dev/null; then
                echo -e "${YELLOW}Installing pnpm...${NC}"
                npm install -g pnpm
            fi
            pnpm install
        else
            npm install
        fi
    fi
    
    echo -e "${GREEN}✓ Project dependencies installed successfully${NC}"
}

# Function to setup development environment
setup_dev_environment() {
    echo -e "${YELLOW}Setting up development environment...${NC}"
    
    # Create necessary directories
    mkdir -p logs ssl certs config
    
    # Copy environment template if .env doesn't exist
    if [[ ! -f ".env" ]] && [[ -f ".env.example" ]]; then
        cp .env.example .env
        echo -e "${GREEN}✓ Created .env from template${NC}"
    fi
    
    # Generate development TLS certificate if needed
    if [[ ! -f "ssl/server.key" ]] || [[ ! -f "ssl/server.crt" ]]; then
        echo -e "${YELLOW}Generating development TLS certificate...${NC}"
        openssl req -x509 -newkey rsa:2048 -keyout ssl/server.key -out ssl/server.crt -days 365 -nodes \
            -subj "/C=US/ST=State/L=City/O=Development/CN=localhost" 2>/dev/null
        echo -e "${GREEN}✓ Development TLS certificate generated${NC}"
    fi
    
    # Setup git hooks if git repository
    if [[ -d ".git" ]]; then
        echo -e "${YELLOW}Setting up git hooks...${NC}"
        
        # Create pre-commit hook
        cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Pre-commit hook for Task MCP HTTP Server

echo "Running pre-commit checks..."

# Run tests
npm test || exit 1

# Run linting
npm run lint || exit 1

# Run type checking
npm run type-check || exit 1

echo "Pre-commit checks passed!"
EOF
        
        chmod +x .git/hooks/pre-commit
        echo -e "${GREEN}✓ Git hooks setup completed${NC}"
    fi
    
    echo -e "${GREEN}✓ Development environment setup completed${NC}"
}

# Main installation process
echo -e "${YELLOW}Starting installation...${NC}"

# Install runtime
case "$RUNTIME" in
    "node")
        install_nodejs
        ;;
    "bun")
        install_bun
        ;;
    *)
        echo -e "${RED}Error: Unsupported runtime: $RUNTIME${NC}"
        exit 1
        ;;
esac

# Install global tools
if [[ "$GLOBAL_TOOLS" == "true" ]]; then
    install_global_tools
fi

# Install project dependencies
install_project_deps

# Setup development environment
if [[ "$DEV_TOOLS" == "true" ]]; then
    setup_dev_environment
fi

# Verify installation
echo -e "${YELLOW}Verifying installation...${NC}"

# Check runtime
if command -v "$RUNTIME" &> /dev/null; then
    VERSION=$($RUNTIME --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✓ $RUNTIME: $VERSION${NC}"
else
    echo -e "${RED}✗ $RUNTIME: not found${NC}"
fi

# Check package manager
if [[ "$RUNTIME" == "bun" ]]; then
    if command -v bun &> /dev/null; then
        echo -e "${GREEN}✓ bun: $(bun --version)${NC}"
    fi
else
    if command -v npm &> /dev/null; then
        echo -e "${GREEN}✓ npm: $(npm --version)${NC}"
    fi
    
    if command -v pnpm &> /dev/null; then
        echo -e "${GREEN}✓ pnpm: $(pnpm --version)${NC}"
    fi
fi

# Check global tools
if [[ "$GLOBAL_TOOLS" == "true" ]]; then
    for tool in pm2 typescript; do
        if command -v "$tool" &> /dev/null; then
            echo -e "${GREEN}✓ $tool: $($tool --version 2>/dev/null || echo 'installed')${NC}"
        else
            echo -e "${YELLOW}⚠ $tool: not found${NC}"
        fi
    done
fi

# Check security tools
for tool in openssl trivy syft; do
    if command -v "$tool" &> /dev/null; then
        echo -e "${GREEN}✓ $tool: installed${NC}"
    else
        echo -e "${YELLOW}⚠ $tool: not found${NC}"
    fi
done

echo ""
echo -e "${GREEN}✓ Installation completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "1. Configure your environment in .env"
echo -e "2. Run tests: npm test"
echo -e "3. Start development server: npm run start:dev"
echo -e "4. Or use the native runner: ./scripts/run-native.sh --dev"