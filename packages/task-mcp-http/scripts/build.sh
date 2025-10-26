#!/bin/bash

# Task MCP HTTP Server - Build Script
# Multi-architecture Docker build with security scanning

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
REGISTRY="${REGISTRY:-docker.io/fissionai}"
IMAGE_NAME="${IMAGE_NAME:-task-mcp-http}"
VERSION="${VERSION:-$(node -p "require('./package.json').version")}"
GIT_COMMIT="${GIT_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}"
BUILD_DATE="${BUILD_DATE:-$(date -u +'%Y-%m-%dT%H:%M:%SZ')}"
PUSH="${PUSH:-false}"
SCAN="${SCAN:-true}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH="true"
            shift
            ;;
        --no-scan)
            SCAN="false"
            shift
            ;;
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --platforms)
            PLATFORMS="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --push          Push image to registry after build"
            echo "  --no-scan       Skip security scanning"
            echo "  --registry      Docker registry (default: docker.io/fissionai)"
            echo "  --version       Image version (default: package.json version)"
            echo "  --platforms     Target platforms (default: linux/amd64,linux/arm64)"
            echo "  --help          Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  REGISTRY        Docker registry"
            echo "  IMAGE_NAME      Image name"
            echo "  VERSION         Image version"
            echo "  GIT_COMMIT      Git commit hash"
            echo "  BUILD_DATE      Build timestamp"
            echo "  PUSH            Push image after build"
            echo "  SCAN            Run security scanning"
            echo "  PLATFORMS       Target platforms"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Full image name
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${VERSION}"
LATEST_IMAGE="${REGISTRY}/${IMAGE_NAME}:latest"

# Print build configuration
echo -e "${BLUE}Task MCP HTTP Server - Docker Build${NC}"
echo -e "${BLUE}======================================${NC}"
echo -e "Image: ${GREEN}${FULL_IMAGE}${NC}"
echo -e "Latest: ${GREEN}${LATEST_IMAGE}${NC}"
echo -e "Platforms: ${GREEN}${PLATFORMS}${NC}"
echo -e "Git Commit: ${GREEN}${GIT_COMMIT}${NC}"
echo -e "Build Date: ${GREEN}${BUILD_DATE}${NC}"
echo -e "Push: ${GREEN}${PUSH}${NC}"
echo -e "Security Scan: ${GREEN}${SCAN}${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed or not in PATH${NC}"
    exit 1
fi

# Check if docker buildx is available
if ! docker buildx version &> /dev/null; then
    echo -e "${RED}Error: Docker buildx is not available${NC}"
    exit 1
fi

# Check if we're building for multiple platforms and docker buildx is properly set up
if [[ "$PLATFORMS" == *","* ]]; then
    echo -e "${YELLOW}Setting up multi-platform builder...${NC}"
    docker buildx create --name multiarch --use --bootstrap 2>/dev/null || true
fi

# Run tests before building
echo -e "${YELLOW}Running tests...${NC}"
if ! npm test; then
    echo -e "${RED}Error: Tests failed${NC}"
    exit 1
fi

# Build the application
echo -e "${YELLOW}Building application...${NC}"
if ! npm run build; then
    echo -e "${RED}Error: Build failed${NC}"
    exit 1
fi

# Build Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
BUILD_ARGS=(
    "--build-arg" "BUILD_VERSION=${VERSION}"
    "--build-arg" "GIT_COMMIT=${GIT_COMMIT}"
    "--build-arg" "BUILD_DATE=${BUILD_DATE}"
    "--platform" "${PLATFORMS}"
    "--tag" "${FULL_IMAGE}"
    "--tag" "${LATEST_IMAGE}"
    "--progress" "plain"
    "--pull"
)

if [[ "$PUSH" == "true" ]]; then
    BUILD_ARGS+=("--push")
else
    BUILD_ARGS+=("--load")
fi

if ! docker buildx build "${BUILD_ARGS[@]}" .; then
    echo -e "${RED}Error: Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker build completed successfully${NC}"

# Security scanning
if [[ "$SCAN" == "true" ]]; then
    echo -e "${YELLOW}Running security scan...${NC}"
    
    # Check if trivy is available
    if command -v trivy &> /dev/null; then
        echo -e "${BLUE}Running Trivy security scan...${NC}"
        if trivy image --exit-code 1 --severity "HIGH,CRITICAL" "${FULL_IMAGE}"; then
            echo -e "${GREEN}✓ Security scan passed${NC}"
        else
            echo -e "${RED}⚠ Security scan found vulnerabilities${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}Warning: Trivy not found, skipping security scan${NC}"
        echo -e "${YELLOW}Install Trivy: https://github.com/aquasecurity/trivy${NC}"
    fi
fi

# Push to registry
if [[ "$PUSH" == "true" ]]; then
    echo -e "${YELLOW}Pushing to registry...${NC}"
    if docker push "${FULL_IMAGE}" && docker push "${LATEST_IMAGE}"; then
        echo -e "${GREEN}✓ Images pushed successfully${NC}"
    else
        echo -e "${RED}Error: Failed to push images${NC}"
        exit 1
    fi
fi

# Generate SBOM
echo -e "${YELLOW}Generating SBOM...${NC}"
if command -v syft &> /dev/null; then
    syft "${FULL_IMAGE}" -o spdx-json > "sbom-${VERSION}.json"
    echo -e "${GREEN}✓ SBOM generated: sbom-${VERSION}.json${NC}"
else
    echo -e "${YELLOW}Warning: Syft not found, skipping SBOM generation${NC}"
fi

# Print summary
echo ""
echo -e "${BLUE}Build Summary${NC}"
echo -e "${BLUE}=============${NC}"
echo -e "Image: ${GREEN}${FULL_IMAGE}${NC}"
echo -e "Latest: ${GREEN}${LATEST_IMAGE}${NC}"
echo -e "Size: ${GREEN}$(docker images --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}" | grep ${IMAGE_NAME} | grep ${VERSION} | awk '{print $2}')${NC}"

if [[ "$SCAN" == "true" ]] && command -v trivy &> /dev/null; then
    echo -e "Security: ${GREEN}Passed${NC}"
fi

if [[ "$PUSH" == "true" ]]; then
    echo -e "Status: ${GREEN}Pushed to registry${NC}"
else
    echo -e "Status: ${GREEN}Built locally${NC}"
fi

echo ""
echo -e "${GREEN}✓ Build completed successfully!${NC}"