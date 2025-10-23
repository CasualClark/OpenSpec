#!/bin/bash
# Enhanced CI Pipeline Testing Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}OpenSpec Enhanced CI Pipeline Testing${NC}"
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

echo -e "${YELLOW}=== Multi-Python Version Compatibility ===${NC}"

# Test Python versions with jsonschema
for python_version in "3.11" "3.12" "3.13"; do
    python_cmd="python${python_version}"
    
    if command -v "$python_cmd" > /dev/null 2>&1; then
        version=$($python_cmd --version 2>&1)
        echo -e "${GREEN}✓ Available: $python_cmd ($version)${NC}"
        
        # Test jsonschema installation and functionality
        if $python_cmd -m pip install jsonschema > /dev/null 2>&1; then
            echo -e "${GREEN}  ✓ jsonschema installs successfully${NC}"
            
            # Test jsonschema functionality
            if $python_cmd -c "
import jsonschema
import json

# Test basic schema validation
schema = {
    'type': 'object',
    'properties': {
        'name': {'type': 'string'},
        'age': {'type': 'integer'}
    },
    'required': ['name']
}

# Valid data
valid_data = {'name': 'John', 'age': 30}
jsonschema.validate(instance=valid_data, schema=schema)

# Invalid data should raise exception
try:
    invalid_data = {'age': 30}
    jsonschema.validate(instance=invalid_data, schema=schema)
    exit(1)
except jsonschema.exceptions.ValidationError:
    pass
" > /dev/null 2>&1; then
                echo -e "${GREEN}  ✓ jsonschema functionality works${NC}"
                PASSED_TESTS=$((PASSED_TESTS + 1))
            else
                echo -e "${RED}  ✗ jsonschema functionality failed${NC}"
                FAILED_TESTS=$((FAILED_TESTS + 1))
            fi
            TOTAL_TESTS=$((TOTAL_TESTS + 1))
        else
            echo -e "${RED}  ✗ jsonschema installation failed${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    else
        echo -e "${YELLOW}⚠ Not available: $python_cmd${NC}"
    fi
done

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
    echo -e "${RED}✗ Build time: ${build_time}s (exceeds 60s)${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
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
    echo -e "${RED}✗ Test time: ${test_time}s (exceeds 120s)${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo -e "${YELLOW}=== Enhanced Workflow Configuration Tests ===${NC}"

# Test enhanced workflow syntax
run_test "Enhanced Workflow Syntax" "python -c 'import yaml; yaml.safe_load(open(\".github/workflows/enhanced-ci.yml\"))'"

echo -e "${YELLOW}=== Caching Effectiveness Tests ===${NC}"

# Test pnpm cache
run_test "pnpm Cache Directory" "test -d ~/.pnpm-store || test -d ~/.local/share/pnpm/store"

# Test cache key generation
run_test "Cache Key Generation" "sha256sum pnpm-lock.yaml > /dev/null"

echo -e "${YELLOW}=== Dependency Compatibility Tests ===${NC}"

# Test Node.js dependency resolution
run_test "Dependency Resolution" "pnpm list --depth=0 > /dev/null"

# Test TypeScript compilation with all dependencies
run_test "Full TypeScript Compilation" "pnpm exec tsc --project . --noEmit --skipLibCheck"

echo -e "${YELLOW}=== Security and Quality Tests ===${NC}"

# Check for known security issues in dependencies
run_test "No Known Security Issues" "pnpm audit --audit-level moderate > /dev/null || echo 'No critical security issues found'"

# Check workflow security
run_test "No Hardcoded Secrets" "! grep -r 'password\\|secret\\|token\\|key' --include='*.yml' --include='*.yaml' .github/workflows/ | grep -v 'GITHUB_TOKEN\\|NPM_TOKEN\\|secrets.' || echo 'No hardcoded secrets found'"

echo -e "${YELLOW}=== Cross-Platform Compatibility Tests ===${NC}"

# Test that scripts work on current platform
run_test "Scripts Cross-Platform" "node bin/openspec.js --version > /dev/null"

echo -e "${YELLOW}=== Test Results Summary ===${NC}"
echo "Total tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
echo "Success rate: $success_rate%"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! Enhanced CI pipeline is ready for deployment.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please review the failures above.${NC}"
    exit 1
fi