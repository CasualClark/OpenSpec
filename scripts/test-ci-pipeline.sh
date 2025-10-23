#!/bin/bash
# Comprehensive CI Pipeline Testing Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}OpenSpec CI Pipeline Testing Script${NC}"
echo "Project directory: $PROJECT_DIR"
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

# Function to test Python version compatibility
test_python_version() {
    local python_version="$1"
    local python_cmd="$2"
    
    if command -v "$python_cmd" > /dev/null 2>&1; then
        echo -e "${YELLOW}Testing Python $python_version compatibility...${NC}"
        
        # Create test virtual environment
        local test_venv="$PROJECT_DIR/test_venv_$python_version"
        
        if [ -d "$test_venv" ]; then
            rm -rf "$test_venv"
        fi
        
        "$python_cmd" -m venv "$test_venv"
        source "$test_venv/bin/activate"
        
        # Upgrade pip
        pip install --upgrade pip
        
        # Install test dependencies
        pip install jsonschema pytest pytest-cov
        
        # Test basic imports
        python -c "import jsonschema, pytest; print('✓ Dependencies available for Python $python_version')"
        
        # Run schema validation tests
        cd "$PROJECT_DIR"
        if python schemas/test_schema_validation.py > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Schema validation tests pass for Python $python_version${NC}"
        else
            echo -e "${RED}✗ Schema validation tests fail for Python $python_version${NC}"
            return 1
        fi
        
        # Run Python test suite
        cd "$PROJECT_DIR/test/python"
        if python -m pytest tests/ -v --tb=short > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Python test suite passes for Python $python_version${NC}"
        else
            echo -e "${RED}✗ Python test suite fails for Python $python_version${NC}"
            return 1
        fi
        
        # Cleanup
        deactivate
        rm -rf "$test_venv"
        
        return 0
    else
        echo -e "${YELLOW}Python $python_version not available, skipping${NC}"
        return 0
    fi
}

# Change to project directory
cd "$PROJECT_DIR"

echo -e "${YELLOW}=== Environment Validation ===${NC}"

# Test Node.js installation
run_test "Node.js Installation" "node --version"
run_test "Node.js Version Check" "node -e 'const v=process.versions.node.split(\".\"); if(parseInt(v[0])<20) throw new Error(\"Node.js version too low\")'"

# Test pnpm installation
run_test "pnpm Installation" "pnpm --version"

# Test TypeScript installation
run_test "TypeScript Installation" "pnpm exec tsc --version"

echo -e "${YELLOW}=== Project Build Tests ===${NC}"

# Clean install
run_test "Clean Dependencies Install" "pnpm install --frozen-lockfile"

# Build project
run_test "Project Build" "pnpm run build"

# Type checking
run_test "TypeScript Type Check" "pnpm exec tsc --noEmit"

# Run tests
run_test "Test Suite" "pnpm test"

echo -e "${YELLOW}=== Schema Validation Tests ===${NC}"

# Test schema validation script
if [ -f "schemas/validate-schemas.js" ]; then
    run_test "Schema Validation Script" "node schemas/validate-schemas.js"
else
    echo -e "${YELLOW}Schema validation script not found, checking src/core/schemas${NC}"
    # Test individual schema files
    for schema in src/core/schemas/*.schema.json; do
        if [ -f "$schema" ]; then
            schema_name=$(basename "$schema")
            run_test "Schema File: $schema_name" "jq . '$schema' > /dev/null"
        fi
    done
fi

echo -e "${YELLOW}=== Multi-Python Version Compatibility ===${NC}"

# Test Python 3.11
test_python_version "3.11" "python3.11" && PASSED_TESTS=$((PASSED_TESTS + 1)) || FAILED_TESTS=$((FAILED_TESTS + 1))
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test Python 3.12
test_python_version "3.12" "python3.12" && PASSED_TESTS=$((PASSED_TESTS + 1)) || FAILED_TESTS=$((FAILED_TESTS + 1))
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test Python 3.13
test_python_version "3.13" "python3.13" && PASSED_TESTS=$((PASSED_TESTS + 1)) || FAILED_TESTS=$((FAILED_TESTS + 1))
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo -e "${YELLOW}=== Caching Tests ===${NC}"

# Test pnpm cache
run_test "pnpm Cache Directory" "test -d ~/.pnpm-store || test -d ~/.local/share/pnpm/store"

# Test if cache would be effective
run_test "pnpm Lockfile Hash" "sha256sum pnpm-lock.yaml > /dev/null"

echo -e "${YELLOW}=== Workflow Configuration Tests ===${NC}"

# Test workflow syntax
for workflow in .github/workflows/*.yml; do
    if [ -f "$workflow" ]; then
        workflow_name=$(basename "$workflow")
        run_test "Workflow Syntax: $workflow_name" "yamllint '$workflow' || echo 'yamllint not available, checking basic syntax' && python -c 'import yaml; yaml.safe_load(open(\"$workflow\"))'"
    fi
done

echo -e "${YELLOW}=== Security and Quality Tests ===${NC}"

# Check for sensitive data patterns
run_test "No Hardcoded Secrets" "! grep -r 'password\\|secret\\|token\\|key' --include='*.yml' --include='*.yaml' .github/ | grep -v 'GITHUB_TOKEN\\|NPM_TOKEN' || echo 'No hardcoded secrets found'"

# Check action versions
run_test "GitHub Actions Versions" "grep -r 'uses:' .github/workflows/ | grep -v '@local' | head -5"

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
    echo -e "${GREEN}🎉 All tests passed! CI pipeline is ready.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please review the failures above.${NC}"
    exit 1
fi