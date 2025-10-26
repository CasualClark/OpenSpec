#!/usr/bin/env node

/**
 * Benchmark Data Generator for Phase 3 Performance Testing
 * 
 * Generates specialized benchmark data for different performance scenarios:
 * - High-volume pagination data
 * - Large file streaming data
 * - Concurrency test scenarios
 * - Memory pressure test data
 * - Edge case scenarios
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { randomBytes } from 'crypto';

interface BenchmarkConfig {
  outputDir: string;
  scenarios: BenchmarkScenario[];
  globalSettings: {
    seed: number;
    compressionEnabled: boolean;
    encryptionEnabled: boolean;
  };
}

interface BenchmarkScenario {
  name: string;
  type: 'pagination' | 'streaming' | 'concurrency' | 'memory' | 'edge-cases';
  description: string;
  parameters: Record<string, any>;
  expectedResults: {
    maxExecutionTime: number;
    maxMemoryUsage: number;
    minThroughput?: number;
  };
}

interface GeneratedData {
  scenario: string;
  files: string[];
  metadata: Record<string, any>;
  generatedAt: string;
  size: number;
}

class BenchmarkDataGenerator {
  private config: BenchmarkConfig;
  private random: () => number;

  constructor(config: BenchmarkConfig) {
    this.config = config;
    // Seeded random number generator for reproducible results
    this.random = this.createSeededRandom(config.globalSettings.seed);
  }

  /**
   * Generate all benchmark scenarios
   */
  async generateAllScenarios(): Promise<GeneratedData[]> {
    console.log('🏗️ Generating Benchmark Data for Phase 3 Performance Testing...\n');
    const startTime = performance.now();

    const results: GeneratedData[] = [];

    try {
      // Ensure output directory exists
      await fs.mkdir(this.config.outputDir, { recursive: true });

      // Generate each scenario
      for (const scenario of this.config.scenarios) {
        console.log(`📊 Generating scenario: ${scenario.name}`);
        const data = await this.generateScenario(scenario);
        results.push(data);
        console.log(`  ✅ Generated ${data.files.length} files (${(data.size / 1024 / 1024).toFixed(2)}MB)`);
      }

      // Generate master index
      await this.generateMasterIndex(results);

      // Generate test runner scripts
      await this.generateTestRunners(results);

      const totalTime = performance.now() - startTime;
      console.log(`\n🎉 Benchmark data generation completed in ${totalTime.toFixed(2)}ms`);
      console.log(`📁 Output directory: ${this.config.outputDir}`);
      console.log(`📊 Scenarios generated: ${results.length}`);

    } catch (error) {
      console.error('❌ Failed to generate benchmark data:', error);
      throw error;
    }

    return results;
  }

  /**
   * Generate individual scenario
   */
  private async generateScenario(scenario: BenchmarkScenario): Promise<GeneratedData> {
    const scenarioDir = join(this.config.outputDir, scenario.name);
    await fs.mkdir(scenarioDir, { recursive: true });

    const files: string[] = [];
    let totalSize = 0;

    switch (scenario.type) {
      case 'pagination':
        const paginationFiles = await this.generatePaginationData(scenario, scenarioDir);
        files.push(...paginationFiles.files);
        totalSize += paginationFiles.size;
        break;

      case 'streaming':
        const streamingFiles = await this.generateStreamingData(scenario, scenarioDir);
        files.push(...streamingFiles.files);
        totalSize += streamingFiles.size;
        break;

      case 'concurrency':
        const concurrencyFiles = await this.generateConcurrencyData(scenario, scenarioDir);
        files.push(...concurrencyFiles.files);
        totalSize += concurrencyFiles.size;
        break;

      case 'memory':
        const memoryFiles = await this.generateMemoryData(scenario, scenarioDir);
        files.push(...memoryFiles.files);
        totalSize += memoryFiles.size;
        break;

      case 'edge-cases':
        const edgeCaseFiles = await this.generateEdgeCaseData(scenario, scenarioDir);
        files.push(...edgeCaseFiles.files);
        totalSize += edgeCaseFiles.size;
        break;

      default:
        throw new Error(`Unknown scenario type: ${scenario.type}`);
    }

    // Generate scenario metadata
    const metadata = {
      scenario: scenario.name,
      type: scenario.type,
      description: scenario.description,
      parameters: scenario.parameters,
      expectedResults: scenario.expectedResults,
      fileCount: files.length,
      totalSize,
      generatedAt: new Date().toISOString()
    };

    await fs.writeFile(
      join(scenarioDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    return {
      scenario: scenario.name,
      files: files.map(f => join(scenario.name, f)),
      metadata,
      generatedAt: metadata.generatedAt,
      size: totalSize
    };
  }

  /**
   * Generate pagination benchmark data
   */
  private async generatePaginationData(scenario: BenchmarkScenario, outputDir: string) {
    const files: string[] = [];
    let totalSize = 0;

    const { itemCount = 1000, pageSizeVariations = [10, 25, 50, 100] } = scenario.parameters;

    // Generate changes data
    const changesDir = join(outputDir, 'changes');
    await fs.mkdir(changesDir, { recursive: true });

    for (let i = 0; i < itemCount; i++) {
      const change = this.generateChangeData(i);
      const changeFile = join(changesDir, `change-${String(i + 1).padStart(6, '0')}.json`);
      const content = JSON.stringify(change, null, 2);
      
      await fs.writeFile(changeFile, content);
      files.push(`changes/change-${String(i + 1).padStart(6, '0')}.json`);
      totalSize += content.length;
    }

    // Generate pagination test configurations
    for (const pageSize of pageSizeVariations) {
      const config = {
        pageSize,
        totalItems: itemCount,
        totalPages: Math.ceil(itemCount / pageSize),
        testType: 'pagination',
        expectedMaxTime: scenario.expectedResults.maxExecutionTime
      };

      const configFile = join(outputDir, `config-page-${pageSize}.json`);
      const content = JSON.stringify(config, null, 2);
      
      await fs.writeFile(configFile, content);
      files.push(`config-page-${pageSize}.json`);
      totalSize += content.length;
    }

    return { files, size: totalSize };
  }

  /**
   * Generate streaming benchmark data
   */
  private async generateStreamingData(scenario: BenchmarkScenario, outputDir: string) {
    const files: string[] = [];
    let totalSize = 0;

    const { fileSizes = [10485760, 52428800, 104857600], chunkSizes = [1024, 4096, 16384, 65536] } = scenario.parameters;

    // Generate large files of different sizes
    for (const size of fileSizes) {
      const fileName = `stream-file-${size}.bin`;
      const filePath = join(outputDir, fileName);
      
      const content = this.generateBinaryFile(size);
      await fs.writeFile(filePath, content);
      
      files.push(fileName);
      totalSize += content.length;
    }

    // Generate chunked streaming test data
    for (const chunkSize of chunkSizes) {
      const chunkDir = join(outputDir, `chunks-${chunkSize}`);
      await fs.mkdir(chunkDir, { recursive: true });

      const chunkCount = 100;
      for (let i = 0; i < chunkCount; i++) {
        const chunkFile = join(chunkDir, `chunk-${String(i + 1).padStart(3, '0')}.bin`);
        const content = this.generateBinaryFile(chunkSize);
        
        await fs.writeFile(chunkFile, content);
        files.push(`chunks-${chunkSize}/chunk-${String(i + 1).padStart(3, '0')}.bin`);
        totalSize += content.length;
      }

      // Generate chunk manifest
      const manifest = {
        chunkSize,
        chunkCount,
        totalSize: chunkCount * chunkSize,
        testType: 'streaming-chunks'
      };

      const manifestFile = join(chunkDir, 'manifest.json');
      const manifestContent = JSON.stringify(manifest, null, 2);
      await fs.writeFile(manifestFile, manifestContent);
      files.push(`chunks-${chunkSize}/manifest.json`);
      totalSize += manifestContent.length;
    }

    return { files, size: totalSize };
  }

  /**
   * Generate concurrency benchmark data
   */
  private async generateConcurrencyData(scenario: BenchmarkScenario, outputDir: string) {
    const files: string[] = [];
    let totalSize = 0;

    const { concurrencyLevels = [1, 5, 10, 20, 50], operationsPerLevel = 100 } = scenario.parameters;

    for (const concurrency of concurrencyLevels) {
      const levelDir = join(outputDir, `concurrency-${concurrency}`);
      await fs.mkdir(levelDir, { recursive: true });

      // Generate operation data for each concurrency level
      for (let i = 0; i < operationsPerLevel; i++) {
        const operation = this.generateOperationData(i, concurrency);
        const operationFile = join(levelDir, `operation-${String(i + 1).padStart(3, '0')}.json`);
        const content = JSON.stringify(operation, null, 2);
        
        await fs.writeFile(operationFile, content);
        files.push(`concurrency-${concurrency}/operation-${String(i + 1).padStart(3, '0')}.json`);
        totalSize += content.length;
      }

      // Generate concurrency test configuration
      const config = {
        concurrency,
        operationsPerLevel,
        testType: 'concurrency',
        expectedMaxTime: scenario.expectedResults.maxExecutionTime,
        expectedMinThroughput: scenario.expectedResults.minThroughput
      };

      const configFile = join(levelDir, 'config.json');
      const configContent = JSON.stringify(config, null, 2);
      await fs.writeFile(configFile, configContent);
      files.push(`concurrency-${concurrency}/config.json`);
      totalSize += configContent.length;
    }

    return { files, size: totalSize };
  }

  /**
   * Generate memory pressure test data
   */
  private async generateMemoryData(scenario: BenchmarkScenario, outputDir: string) {
    const files: string[] = [];
    let totalSize = 0;

    const { memoryLevels = [1048576, 10485760, 52428800, 104857600], dataTypes = ['objects', 'arrays', 'strings', 'buffers'] } = scenario.parameters;

    for (const memoryLevel of memoryLevels) {
      for (const dataType of dataTypes) {
        const fileName = `memory-${memoryLevel}-${dataType}.json`;
        const filePath = join(outputDir, fileName);
        
        let content: string;
        switch (dataType) {
          case 'objects':
            content = this.generateObjectData(memoryLevel);
            break;
          case 'arrays':
            content = this.generateArrayData(memoryLevel);
            break;
          case 'strings':
            content = this.generateStringData(memoryLevel);
            break;
          case 'buffers':
            content = this.generateBufferData(memoryLevel);
            break;
          default:
            throw new Error(`Unknown data type: ${dataType}`);
        }

        await fs.writeFile(filePath, content);
        files.push(fileName);
        totalSize += content.length;
      }
    }

    // Generate memory test configurations
    for (const memoryLevel of memoryLevels) {
      const config = {
        memoryLevel,
        testType: 'memory-pressure',
        expectedMaxMemory: scenario.expectedResults.maxMemoryUsage,
        expectedMaxTime: scenario.expectedResults.maxExecutionTime
      };

      const configFile = join(outputDir, `memory-config-${memoryLevel}.json`);
      const configContent = JSON.stringify(config, null, 2);
      await fs.writeFile(configFile, configContent);
      files.push(`memory-config-${memoryLevel}.json`);
      totalSize += configContent.length;
    }

    return { files, size: totalSize };
  }

  /**
   * Generate edge case test data
   */
  private async generateEdgeCaseData(scenario: BenchmarkScenario, outputDir: string) {
    const files: string[] = [];
    let totalSize = 0;

    const edgeCases = [
      { name: 'empty-data', generator: () => '[]' },
      { name: 'single-item', generator: () => JSON.stringify([{ id: 1, data: 'test' }]) },
      { name: 'deep-nesting', generator: () => this.generateDeepNestedData(100) },
      { name: 'wide-structure', generator: () => this.generateWideStructure(1000) },
      { name: 'unicode-heavy', generator: () => this.generateUnicodeData(10000) },
      { name: 'special-characters', generator: () => this.generateSpecialCharData(10000) },
      { name: 'large-numbers', generator: () => this.generateLargeNumberData(1000) },
      { name: 'null-undefined-heavy', generator: () => this.generateNullUndefinedData(1000) }
    ];

    for (const edgeCase of edgeCases) {
      const fileName = `edge-case-${edgeCase.name}.json`;
      const filePath = join(outputDir, fileName);
      
      const content = edgeCase.generator();
      await fs.writeFile(filePath, content);
      
      files.push(fileName);
      totalSize += content.length;
    }

    return { files, size: totalSize };
  }

  /**
   * Generate change data for pagination tests
   */
  private generateChangeData(index: number) {
    const types = ['proposal', 'spec', 'task', 'delta'];
    const statuses = ['draft', 'active', 'completed', 'archived'];
    const priorities = ['low', 'medium', 'high', 'critical'];

    return {
      id: `change-${index + 1}`,
      slug: `change-${String(index + 1).padStart(4, '0')}-${Date.now()}`,
      title: `Change ${index + 1}: ${this.generateRandomTitle()}`,
      description: this.generateRandomDescription(),
      type: types[Math.floor(this.random() * types.length)],
      status: statuses[Math.floor(this.random() * statuses.length)],
      priority: priorities[Math.floor(this.random() * priorities.length)],
      timestamp: new Date(Date.now() - this.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      tags: this.generateRandomTags(),
      metadata: {
        complexity: Math.floor(this.random() * 10) + 1,
        estimatedHours: Math.floor(this.random() * 40) + 1,
        dependencies: this.generateDependencies(index),
        assignee: this.random() > 0.5 ? this.getRandomAssignee() : undefined
      },
      content: this.generateRandomContent()
    };
  }

  /**
   * Generate operation data for concurrency tests
   */
  private generateOperationData(index: number, concurrency: number) {
    return {
      id: `op-${concurrency}-${index + 1}`,
      type: ['read', 'write', 'update', 'delete'][Math.floor(this.random() * 4)],
      concurrency,
      timestamp: new Date().toISOString(),
      payload: {
        size: Math.floor(this.random() * 10000) + 1000,
        complexity: Math.floor(this.random() * 5) + 1,
        dependencies: Math.floor(this.random() * 3)
      },
      expectedDuration: Math.floor(this.random() * 1000) + 100
    };
  }

  /**
   * Generate binary file content
   */
  private generateBinaryFile(size: number): Buffer {
    return randomBytes(size);
  }

  /**
   * Generate object data for memory tests
   */
  private generateObjectData(targetSize: number): string {
    const objects = [];
    let currentSize = 0;
    
    while (currentSize < targetSize) {
      const obj = {
        id: Math.floor(this.random() * 1000000),
        data: 'x'.repeat(Math.min(1000, targetSize - currentSize)),
        timestamp: Date.now(),
        metadata: {
          type: 'test',
          version: '1.0.0',
          tags: this.generateRandomTags()
        }
      };
      
      objects.push(obj);
      currentSize += JSON.stringify(obj).length;
    }
    
    return JSON.stringify(objects);
  }

  /**
   * Generate array data for memory tests
   */
  private generateArrayData(targetSize: number): string {
    const arrays = [];
    let currentSize = 0;
    
    while (currentSize < targetSize) {
      const array = Array.from({ length: 1000 }, (_, i) => ({
        index: i,
        value: this.random(),
        data: 'x'.repeat(10)
      }));
      
      arrays.push(array);
      currentSize += JSON.stringify(array).length;
    }
    
    return JSON.stringify(arrays);
  }

  /**
   * Generate string data for memory tests
   */
  private generateStringData(targetSize: number): string {
    const strings = [];
    let currentSize = 0;
    
    while (currentSize < targetSize) {
      const str = 'x'.repeat(Math.min(10000, targetSize - currentSize));
      strings.push(str);
      currentSize += str.length;
    }
    
    return JSON.stringify(strings);
  }

  /**
   * Generate buffer data for memory tests
   */
  private generateBufferData(targetSize: number): string {
    const buffer = randomBytes(Math.min(targetSize, 1024 * 1024)); // Limit to 1MB for JSON serialization
    const data = Array.from(buffer);
    
    // For larger buffers, create a summary instead of full data
    if (targetSize > 1024 * 1024) {
      return JSON.stringify({
        type: 'Buffer',
        size: targetSize,
        sample: data,
        encoding: 'binary',
        truncated: true
      });
    }
    
    return JSON.stringify({
      type: 'Buffer',
      data: data,
      encoding: 'binary',
      truncated: false
    });
  }

  /**
   * Generate deeply nested data for edge cases
   */
  private generateDeepNestedData(depth: number): string {
    if (depth === 0) {
      return JSON.stringify({ value: 'leaf' });
    }
    
    return JSON.stringify({
      level: depth,
      nested: JSON.parse(this.generateDeepNestedData(depth - 1)),
      data: 'x'.repeat(100)
    });
  }

  /**
   * Generate wide structure data for edge cases
   */
  private generateWideStructure(width: number): string {
    const obj: any = {};
    
    for (let i = 0; i < width; i++) {
      obj[`field_${i}`] = {
        value: this.random(),
        data: 'x'.repeat(10),
        metadata: { index: i }
      };
    }
    
    return JSON.stringify(obj);
  }

  /**
   * Generate Unicode-heavy data for edge cases
   */
  private generateUnicodeData(length: number): string {
    const unicodeChars = '😀🎉🚀💻📊🔥⚡🌟💎🎯📈🔧🛠️🎨📝🔍💡🌈🎭🎪🎨🎼';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += unicodeChars[Math.floor(this.random() * unicodeChars.length)];
    }
    
    return JSON.stringify({ unicode_data: result });
  }

  /**
   * Generate special character data for edge cases
   */
  private generateSpecialCharData(length: number): string {
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?~`\'"\\';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += specialChars[Math.floor(this.random() * specialChars.length)];
    }
    
    return JSON.stringify({ special_chars: result });
  }

  /**
   * Generate large number data for edge cases
   */
  private generateLargeNumberData(count: number): string {
    const numbers = [];
    
    for (let i = 0; i < count; i++) {
      numbers.push({
        id: i,
        large_number: Number.MAX_SAFE_INTEGER - i,
        small_number: Number.MIN_SAFE_INTEGER + i,
        float_number: this.random() * Number.MAX_VALUE,
        scientific: 1.23e+45
      });
    }
    
    return JSON.stringify(numbers);
  }

  /**
   * Generate null/undefined heavy data for edge cases
   */
  private generateNullUndefinedData(count: number): string {
    const data = [];
    
    for (let i = 0; i < count; i++) {
      const item: any = {
        id: i
      };
      
      // Randomly set properties to null or undefined
      if (this.random() > 0.5) item.value = null;
      if (this.random() > 0.5) item.description = null;
      if (this.random() > 0.5) item.metadata = null;
      if (this.random() > 0.5) item.tags = null;
      
      data.push(item);
    }
    
    return JSON.stringify(data);
  }

  /**
   * Generate master index of all scenarios
   */
  private async generateMasterIndex(results: GeneratedData[]): Promise<void> {
    const masterIndex = {
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
      totalScenarios: results.length,
      totalSize: results.reduce((sum, r) => sum + r.size, 0),
      scenarios: results.map(r => ({
        name: r.scenario,
        fileCount: r.files.length,
        size: r.size,
        generatedAt: r.generatedAt,
        metadata: r.metadata
      })),
      configuration: this.config
    };

    await fs.writeFile(
      join(this.config.outputDir, 'master-index.json'),
      JSON.stringify(masterIndex, null, 2)
    );
  }

  /**
   * Generate test runner scripts
   */
  private async generateTestRunners(results: GeneratedData[]): Promise<void> {
    const runnersDir = join(this.config.outputDir, 'runners');
    await fs.mkdir(runnersDir, { recursive: true });

    // Generate individual scenario runners
    for (const result of results) {
      const runnerScript = this.generateScenarioRunner(result);
      await fs.writeFile(
        join(runnersDir, `run-${result.scenario}.js`),
        runnerScript
      );
    }

    // Generate master runner
    const masterRunner = this.generateMasterRunner(results);
    await fs.writeFile(
      join(runnersDir, 'run-all.js'),
      masterRunner
    );
  }

  /**
   * Generate scenario runner script
   */
  private generateScenarioRunner(result: GeneratedData): string {
    return `#!/usr/bin/env node

/**
 * Runner for ${result.scenario} benchmark scenario
 */

import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';

async function run${result.scenario.replace(/[^a-zA-Z0-9]/g, '')}Benchmark() {
  console.log('🚀 Running ${result.scenario} benchmark...');
  
  const startTime = performance.now();
  
  try {
    // Load scenario metadata
    const metadata = JSON.parse(await fs.readFile('./${result.scenario}/metadata.json', 'utf-8'));
    console.log(\`📊 Scenario: \${metadata.description}\`);
    
    // Run scenario-specific tests
    const results = await runScenarioTests(metadata);
    
    const totalTime = performance.now() - startTime;
    
    // Generate report
    const report = {
      scenario: '${result.scenario}',
      timestamp: new Date().toISOString(),
      totalExecutionTime: totalTime,
      results,
      metadata,
      passed: validateResults(results, metadata.expectedResults)
    };
    
    await fs.writeFile('./runners/${result.scenario}-results.json', JSON.stringify(report, null, 2));
    
    console.log(\`✅ ${result.scenario} benchmark completed in \${totalTime.toFixed(2)}ms\`);
    console.log(\`📊 Status: \${report.passed ? 'PASSED' : 'FAILED'}\`);
    
    return report;
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    throw error;
  }
}

async function runScenarioTests(metadata) {
  // Implement scenario-specific test logic here
  // This is a placeholder that should be customized per scenario type
  
  switch (metadata.type) {
    case 'pagination':
      return await runPaginationTests(metadata);
    case 'streaming':
      return await runStreamingTests(metadata);
    case 'concurrency':
      return await runConcurrencyTests(metadata);
    case 'memory':
      return await runMemoryTests(metadata);
    case 'edge-cases':
      return await runEdgeCaseTests(metadata);
    default:
      throw new Error(\`Unknown scenario type: \${metadata.type}\`);
  }
}

async function runPaginationTests(metadata) {
  const results = [];
  
  // Test different page sizes
  for (const pageSize of [10, 25, 50, 100]) {
    const startTime = performance.now();
    
    // Simulate pagination operation
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    results.push({
      test: \`pagination-page-\${pageSize}\`,
      duration,
      pageSize,
      passed: duration < metadata.expectedResults.maxExecutionTime
    });
  }
  
  return results;
}

async function runStreamingTests(metadata) {
  const results = [];
  
  // Test streaming different file sizes
  const fileSizes = [10485760, 52428800, 104857600]; // 10MB, 50MB, 100MB
  
  for (const size of fileSizes) {
    const startTime = performance.now();
    const initialMemory = process.memoryUsage();
    
    // Simulate streaming operation
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    const endTime = performance.now();
    const finalMemory = process.memoryUsage();
    const duration = endTime - startTime;
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    
    results.push({
      test: \`streaming-\${size}\`,
      duration,
      memoryGrowth,
      fileSize: size,
      passed: duration < metadata.expectedResults.maxExecutionTime && 
              memoryGrowth < metadata.expectedResults.maxMemoryUsage
    });
  }
  
  return results;
}

async function runConcurrencyTests(metadata) {
  const results = [];
  
  // Test different concurrency levels
  const concurrencyLevels = [1, 5, 10, 20];
  
  for (const concurrency of concurrencyLevels) {
    const startTime = performance.now();
    
    // Simulate concurrent operations
    const promises = Array.from({ length: concurrency }, async (_, i) => {
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      return i;
    });
    
    await Promise.all(promises);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    results.push({
      test: \`concurrency-\${concurrency}\`,
      duration,
      concurrency,
      passed: duration < metadata.expectedResults.maxExecutionTime
    });
  }
  
  return results;
}

async function runMemoryTests(metadata) {
  const results = [];
  
  // Test different memory levels
  const memoryLevels = [1048576, 10485760, 52428800]; // 1MB, 10MB, 50MB
  
  for (const level of memoryLevels) {
    const startTime = performance.now();
    const initialMemory = process.memoryUsage();
    
    // Simulate memory-intensive operation
    const data = new Array(10000).fill(0).map(() => ({ data: 'x'.repeat(1000) }));
    data.sort(() => Math.random() - 0.5);
    
    const endTime = performance.now();
    const finalMemory = process.memoryUsage();
    const duration = endTime - startTime;
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    
    results.push({
      test: \`memory-\${level}\`,
      duration,
      memoryGrowth,
      memoryLevel: level,
      passed: memoryGrowth < metadata.expectedResults.maxMemoryUsage
    });
  }
  
  return results;
}

async function runEdgeCaseTests(metadata) {
  const results = [];
  
  // Test various edge cases
  const edgeCases = ['empty-data', 'single-item', 'deep-nesting', 'wide-structure'];
  
  for (const edgeCase of edgeCases) {
    const startTime = performance.now();
    
    // Simulate edge case processing
    await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 50));
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    results.push({
      test: \`edge-case-\${edgeCase}\`,
      duration,
      edgeCase,
      passed: duration < metadata.expectedResults.maxExecutionTime
    });
  }
  
  return results;
}

function validateResults(results, expectedResults) {
  return results.every(result => result.passed);
}

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('benchmark-data-generator.js')) {
  run${result.scenario.replace(/[^a-zA-Z0-9]/g, '')}Benchmark()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Benchmark failed:', error);
      process.exit(1);
    });
}
`;
  }

  /**
   * Generate master runner script
   */
  private generateMasterRunner(results: GeneratedData[]): string {
    const scenarioNames = results.map(r => r.scenario);
    
    return `#!/usr/bin/env node

/**
 * Master runner for all benchmark scenarios
 */

import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';

const SCENARIOS = ${JSON.stringify(scenarioNames)};

async function runAllBenchmarks() {
  console.log('🚀 Running all Phase 3 benchmark scenarios...');
  
  const startTime = performance.now();
  const allResults = [];
  
  for (const scenario of SCENARIOS) {
    console.log(\`\\n📊 Running scenario: \${scenario}...\`);
    
    try {
      // Import and run scenario-specific runner
      const { run\${scenario.replace(/[^a-zA-Z0-9]/g, '')}Benchmark } = await import(\`./run-\${scenario}.js\`);
      const result = await run\${scenario.replace(/[^a-zA-Z0-9]/g, '')}Benchmark();
      allResults.push(result);
      
      console.log(\`✅ \${scenario} completed successfully\`);
      
    } catch (error) {
      console.error(\`❌ \${scenario} failed:\`, error);
      allResults.push({
        scenario,
        error: error.message,
        passed: false
      });
    }
  }
  
  const totalTime = performance.now() - startTime;
  
  // Generate master report
  const masterReport = {
    timestamp: new Date().toISOString(),
    totalExecutionTime: totalTime,
    scenarios: SCENARIOS,
    results: allResults,
    summary: {
      total: SCENARIOS.length,
      passed: allResults.filter(r => r.passed).length,
      failed: allResults.filter(r => !r.passed).length
    }
  };
  
  await fs.writeFile('./runners/master-results.json', JSON.stringify(masterReport, null, 2));
  
  console.log(\`\\n🎉 All benchmarks completed in \${totalTime.toFixed(2)}ms\`);
  console.log(\`📊 Summary: \${masterReport.summary.passed}/\${masterReport.summary.total} passed\`);
  
  return masterReport;
}

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('benchmark-data-generator.js')) {
  runAllBenchmarks()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Master benchmark failed:', error);
      process.exit(1);
    });
}
`;
  }

  // Helper methods
  private createSeededRandom(seed: number): () => number {
    let m = 0x80000000;
    let a = 1103515245;
    let c = 12345;
    let state = seed;
    
    return () => {
      state = (a * state + c) % m;
      return state / m;
    };
  }

  private generateRandomTitle(): string {
    const adjectives = ['Advanced', 'Critical', 'Enhanced', 'Improved', 'Modern', 'Optimized'];
    const nouns = ['Architecture', 'Feature', 'Integration', 'Performance', 'Security'];
    return `${adjectives[Math.floor(this.random() * adjectives.length)]} ${nouns[Math.floor(this.random() * nouns.length)]}`;
  }

  private generateRandomDescription(): string {
    const templates = [
      'This change implements critical functionality for improved system performance.',
      'Enhancement focusing on scalability and maintainability.',
      'Security update addressing potential vulnerabilities.',
      'Performance optimization for better resource utilization.'
    ];
    return templates[Math.floor(this.random() * templates.length)];
  }

  private generateRandomTags(): string[] {
    const allTags = ['performance', 'security', 'api', 'frontend', 'backend', 'database', 'testing'];
    const tagCount = Math.floor(this.random() * 3) + 1;
    const tags: string[] = [];
    
    for (let i = 0; i < tagCount; i++) {
      const tag = allTags[Math.floor(this.random() * allTags.length)];
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
    
    return tags;
  }

  private generateDependencies(index: number): string[] {
    const dependencyCount = Math.floor(this.random() * 3);
    const dependencies: string[] = [];
    
    for (let i = 0; i < dependencyCount; i++) {
      const depIndex = Math.max(0, index - Math.floor(this.random() * 10) - 1);
      dependencies.push(`change-${depIndex + 1}`);
    }
    
    return dependencies;
  }

  private getRandomAssignee(): string {
    const assignees = ['alice', 'bob', 'charlie', 'diana', 'eve'];
    return assignees[Math.floor(this.random() * assignees.length)];
  }

  private generateRandomContent(): string {
    const contentTypes = ['text', 'json', 'markdown'];
    const type = contentTypes[Math.floor(this.random() * contentTypes.length)];
    
    switch (type) {
      case 'text':
        return 'This is text content for the change. '.repeat(10);
      case 'json':
        return JSON.stringify({ data: 'example', value: this.random() * 100 });
      case 'markdown':
        return '# Change Content\n\nThis change includes important updates.\n\n## Details\n\n- Item 1\n- Item 2';
      default:
        return 'Default content';
    }
  }
}

// CLI interface
if (process.argv[1] && process.argv[1].endsWith('benchmark-data-generator.js')) {
  const config: BenchmarkConfig = {
    outputDir: './benchmark-data',
    scenarios: [
      {
        name: 'high-volume-pagination',
        type: 'pagination',
        description: 'High-volume pagination with 5000+ items',
        parameters: {
          itemCount: 5000,
          pageSizeVariations: [10, 25, 50, 100, 200]
        },
        expectedResults: {
          maxExecutionTime: 200,
          maxMemoryUsage: 50 * 1024 * 1024
        }
      },
      {
        name: 'large-file-streaming',
        type: 'streaming',
        description: 'Large file streaming with various chunk sizes',
        parameters: {
          fileSizes: [10485760, 52428800, 104857600, 209715200], // 10MB, 50MB, 100MB, 200MB
          chunkSizes: [1024, 4096, 16384, 65536, 262144]
        },
        expectedResults: {
          maxExecutionTime: 5000,
          maxMemoryUsage: 50 * 1024 * 1024
        }
      },
      {
        name: 'high-concurrency',
        type: 'concurrency',
        description: 'High concurrency testing with up to 100 simultaneous operations',
        parameters: {
          concurrencyLevels: [1, 5, 10, 25, 50, 100],
          operationsPerLevel: 200
        },
        expectedResults: {
          maxExecutionTime: 1000,
          maxMemoryUsage: 100 * 1024 * 1024,
          minThroughput: 100
        }
      },
      {
        name: 'memory-pressure',
        type: 'memory',
        description: 'Memory pressure testing with various data types and sizes',
        parameters: {
          memoryLevels: [1048576, 10485760, 52428800, 104857600, 209715200],
          dataTypes: ['objects', 'arrays', 'strings', 'buffers']
        },
        expectedResults: {
          maxExecutionTime: 2000,
          maxMemoryUsage: 200 * 1024 * 1024
        }
      },
      {
        name: 'edge-cases',
        type: 'edge-cases',
        description: 'Edge case testing with unusual data structures',
        parameters: {},
        expectedResults: {
          maxExecutionTime: 500,
          maxMemoryUsage: 20 * 1024 * 1024
        }
      }
    ],
    globalSettings: {
      seed: 12345,
      compressionEnabled: false,
      encryptionEnabled: false
    }
  };
  
  const generator = new BenchmarkDataGenerator(config);
  generator.generateAllScenarios()
    .then(() => {
      console.log('\n🎉 Benchmark data generation completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Benchmark data generation failed:', error);
      process.exit(1);
    });
}

export { BenchmarkDataGenerator, BenchmarkConfig, BenchmarkScenario };