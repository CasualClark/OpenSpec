#!/bin/bash
# Current CI Pipeline Validation Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}OpenSpec Current CI Pipeline Validation${NC}"
echo ""

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -e "${BLUE}Running test: $test_name${NC}"
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS: $test_name${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL: $test_name${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

echo -e "${YELLOW}=== Environment Validation ===${NC}"

# Test Node.js
run_test "Node.js Installation" "node --version"
run_test "Node.js Version >= 20" "node -e 'const v=process.versions.node.split(\".\"); if(parseInt(v[0])<20) throw new Error(\"Node.js version too low\")'"

# Test pnpm
run_test "pnpm Installation" "pnpm --version"

echo -e "${YELLOW}=== Project Build Tests ===${NC}"

# Install dependencies
run_test "Dependencies Install" "pnpm install --frozen-lockfile"

# Build project
run_test "Project Build" "pnpm run build"

# Type checking
run_test "TypeScript Type Check" "pnpm exec tsc --noEmit"

# Run tests
run_test "Test Suite" "pnpm test"

echo -e "${YELLOW}=== Build Artifacts Validation ===${NC}"

# Check build artifacts
run_test "CLI Entry Point Exists" "test -f dist/cli/index.js"
run_test "Main Entry Point Exists" "test -f dist/index.js"
run_test "Type Definitions Exist" "test -f dist/index.d.ts"

echo -e "${YELLOW}=== Multi-Python Version Compatibility (Manual Check) ===${NC}"

# Test Python versions that are available
for python_cmd in python3.11 python3.12 python3.13; do
    if command -v "$python_cmd" > /dev/null 2>&1; then
        version=$($python_cmd --version 2>&1)
        echo -e "${GREEN}✓ Available: $python_cmd ($version)${NC}"
        
        # Test basic jsonschema installation
        if $python_cmd -m pip install jsonschema > /dev/null 2>&1; then
            echo -e "${GREEN}  ✓ jsonschema installs successfully${NC}"
        else
            echo -e "${RED}  ✗ jsonschema installation failed${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Not available: $python_cmd${NC}"
    fi
done

echo -e "${YELLOW}=== Workflow Configuration Tests ===${NC}"

# Test workflow syntax
for workflow in .github/workflows/*.yml; do
    if [ -f "$workflow" ]; then
        workflow_name=$(basename "$workflow")
        run_test "Workflow Syntax: $workflow_name" "python -c 'import yaml; yaml.safe_load(open(\"$workflow\"))'"
    fi
done

echo -e "${YELLOW}=== Caching Tests ===${NC}"

# Test pnpm cache
run_test "pnpm Cache Directory" "test -d ~/.pnpm-store || test -d ~/.local/share/pnpm/store"

echo -e "${YELLOW}=== Performance Tests ===${NC}"

# Measure build time
start_time=$(date +%s)
pnpm run build > /dev/null 2>&1
end_time=$(date +%s)
build_time=$((end_time - start_time))

if [ $build_time -lt 60 ]; then
    echo -e "${GREEN}✓ Build time: ${build_time}s (acceptable)${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${YELLOW}⚠ Build time: ${build_time}s (slow)${NC}"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test test suite performance
start_time=$(date +%s)
pnpm test > /dev/null 2>&1
end_time=$(date +%s)
test_time=$((end_time - start_time))

if [ $test_time -lt 120 ]; then
    echo -e "${GREEN}✓ Test time: ${test_time}s (acceptable)${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${YELLOW}⚠ Test time: ${test_time}s (slow)${NC}"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo -e "${YELLOW}=== Test Results Summary ===${NC}"
echo "Total tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
echo "Success rate: $success_rate%"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! Current CI pipeline is working correctly.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please review the failures above.${NC}"
    exit 1
fi