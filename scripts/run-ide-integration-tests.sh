#!/bin/bash

# IDE Integration Test Runner
# Runs comprehensive IDE workflow integration tests with proper environment setup

set -e

echo "🚀 Starting IDE Integration Tests..."

# Set up environment
export NODE_OPTIONS="--max-old-space-size=4096"
export OPEN_SPEC_INTERACTIVE=0

# Create test directories
mkdir -p test-ide-workflow-tmp
mkdir -p test-performance-tmp

# Clean up any existing test artifacts
echo "🧹 Cleaning up previous test artifacts..."
rm -rf test-ide-workflow-tmp/*
rm -rf test-performance-tmp/*

# Build the project first
echo "🔨 Building OpenSpec..."
npm run build

# Run IDE integration tests with increased timeout
echo "🧪 Running IDE workflow integration tests..."
npm test -- test/e2e/ide-workflow-integration.test.ts --timeout=30000

# Run performance tests to ensure streaming works
echo "📊 Running performance benchmarks..."
npm run test:performance

# Generate coverage report
echo "📈 Generating coverage report..."
npm run test:coverage

echo "✅ IDE Integration Tests completed successfully!"

# Cleanup
echo "🧹 Cleaning up test artifacts..."
rm -rf test-ide-workflow-tmp
rm -rf test-performance-tmp

echo "🎉 All tests passed!"