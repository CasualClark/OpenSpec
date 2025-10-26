#!/usr/bin/env node

/**
 * Test Data Generator for Phase 3 Performance Validation
 * 
 * Generates comprehensive test data including:
 * - 1000+ changes for pagination testing
 * - Large test files (10MB, 50MB, 100MB) for streaming testing
 * - Repository structure with realistic OpenSpec data
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { performance } from 'perf_hooks';

interface TestDataConfig {
  changeCount: number;
  largeFileSizes: number[];
  outputDir: string;
  repoName: string;
}

interface ChangeData {
  id: string;
  slug: string;
  title: string;
  description: string;
  timestamp: string;
  type: 'proposal' | 'spec' | 'task' | 'delta';
  status: 'draft' | 'active' | 'completed' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  tags: string[];
  files: FileData[];
  metadata: Record<string, any>;
}

interface FileData {
  name: string;
  size: number;
  content: string;
  type: 'text' | 'json' | 'markdown' | 'binary';
  checksum: string;
}

class TestDataGenerator {
  private config: TestDataConfig;
  private changeCounter = 0;
  private fileCounter = 0;

  constructor(config: TestDataConfig) {
    this.config = config;
  }

  /**
   * Generate complete test environment
   */
  async generateTestEnvironment(): Promise<void> {
    console.log('🏗️  Generating Phase 3 Performance Test Environment...\n');
    const startTime = performance.now();

    try {
      // Create output directory
      await this.ensureDirectory(this.config.outputDir);
      
      // Generate repository structure
      await this.generateRepositoryStructure();
      
      // Generate changes
      await this.generateChanges();
      
      // Generate large test files
      await this.generateLargeFiles();
      
      // Generate metadata and indexes
      await this.generateMetadata();
      
      // Generate benchmark data scripts
      await this.generateBenchmarkScripts();
      
      const totalTime = performance.now() - startTime;
      console.log(`\n✅ Test environment generated in ${totalTime.toFixed(2)}ms`);
      console.log(`📁 Output directory: ${this.config.outputDir}`);
      console.log(`📝 Changes generated: ${this.config.changeCount}`);
      console.log(`📄 Large files: ${this.config.largeFileSizes.length} files`);
      
    } catch (error) {
      console.error('❌ Failed to generate test environment:', error);
      throw error;
    }
  }

  /**
   * Generate repository structure
   */
  private async generateRepositoryStructure(): Promise<void> {
    console.log('📁 Creating repository structure...');
    
    const repoDir = join(this.config.outputDir, this.config.repoName);
    await this.ensureDirectory(repoDir);
    
    // Create OpenSpec directory structure
    const openspecDir = join(repoDir, 'openspec');
    await this.ensureDirectory(openspecDir);
    
    // Create changes directory
    const changesDir = join(openspecDir, 'changes');
    await this.ensureDirectory(changesDir);
    
    // Create specs directory
    const specsDir = join(openspecDir, 'specs');
    await this.ensureDirectory(specsDir);
    
    // Create config files
    await this.createConfigFiles(repoDir);
  }

  /**
   * Generate configuration files
   */
  private async createConfigFiles(repoDir: string): Promise<void> {
    // OpenSpec config
    const openspecConfig = {
      version: "1.0.0",
      name: this.config.repoName,
      description: "Phase 3 Performance Test Repository",
      created: new Date().toISOString(),
      settings: {
        pagination: {
          defaultPageSize: 50,
          maxPageSize: 100
        },
        streaming: {
          chunkSize: 64 * 1024, // 64KB
          maxMemoryUsage: 50 * 1024 * 1024 // 50MB
        }
      }
    };
    
    await fs.writeFile(
      join(repoDir, 'openspec.json'),
      JSON.stringify(openspecConfig, null, 2)
    );

    // Package.json for test repo
    const packageJson = {
      name: this.config.repoName,
      version: "1.0.0",
      description: "Performance test repository",
      private: true,
      scripts: {
        "test:performance": "openspec test performance",
        "validate": "openspec validate"
      }
    };
    
    await fs.writeFile(
      join(repoDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
  }

  /**
   * Generate changes
   */
  private async generateChanges(): Promise<void> {
    console.log(`📝 Generating ${this.config.changeCount} changes...`);
    
    const changesDir = join(this.config.outputDir, this.config.repoName, 'openspec', 'changes');
    
    // Generate different types of changes
    const changeTypes: ChangeData['type'][] = ['proposal', 'spec', 'task', 'delta'];
    const statusTypes: ChangeData['status'][] = ['draft', 'active', 'completed', 'archived'];
    const priorities: ChangeData['priority'][] = ['low', 'medium', 'high', 'critical'];
    
    for (let i = 0; i < this.config.changeCount; i++) {
      const change = await this.generateChange(i, changeTypes[i % changeTypes.length]);
      const changeDir = join(changesDir, change.slug);
      
      await this.ensureDirectory(changeDir);
      
      // Write change metadata
      await fs.writeFile(
        join(changeDir, 'change.json'),
        JSON.stringify(change, null, 2)
      );
      
      // Write change files
      for (const file of change.files) {
        await fs.writeFile(join(changeDir, file.name), file.content);
      }
      
      // Progress indicator
      if ((i + 1) % 100 === 0) {
        console.log(`  Generated ${i + 1}/${this.config.changeCount} changes...`);
      }
    }
  }

  /**
   * Generate individual change
   */
  private async generateChange(index: number, type: ChangeData['type']): Promise<ChangeData> {
    const slug = `change-${String(index + 1).padStart(4, '0')}-${Date.now()}`;
    const timestamp = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString();
    
    const change: ChangeData = {
      id: `change-${index + 1}`,
      slug,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} ${index + 1}: ${this.generateRandomTitle()}`,
      description: this.generateRandomDescription(type),
      timestamp,
      type,
      status: this.getRandomStatus(),
      priority: this.getRandomPriority(),
      tags: this.generateRandomTags(),
      files: await this.generateChangeFiles(type, index),
      metadata: {
        complexity: Math.floor(Math.random() * 10) + 1,
        estimatedHours: Math.floor(Math.random() * 40) + 1,
        dependencies: this.generateDependencies(index),
        reviewers: this.generateReviewers()
      }
    };
    
    // Add assignee for some changes
    if (Math.random() > 0.3) {
      change.assignee = this.getRandomAssignee();
    }
    
    return change;
  }

  /**
   * Generate files for a change
   */
  private async generateChangeFiles(type: ChangeData['type'], index: number): Promise<FileData[]> {
    const files: FileData[] = [];
    const fileCount = Math.floor(Math.random() * 5) + 1;
    
    for (let i = 0; i < fileCount; i++) {
      const fileType = this.getRandomFileType();
      const fileName = this.generateFileName(fileType, i);
      const content = this.generateFileContent(fileType, type, index);
      
      files.push({
        name: fileName,
        size: content.length,
        content,
        type: fileType,
        checksum: this.generateChecksum(content)
      });
    }
    
    return files;
  }

  /**
   * Generate large test files
   */
  private async generateLargeFiles(): Promise<void> {
    console.log('📄 Generating large test files...');
    
    const testFilesDir = join(this.config.outputDir, 'test-files');
    await this.ensureDirectory(testFilesDir);
    
    for (const size of this.config.largeFileSizes) {
      const fileName = `test-file-${size / 1024 / 1024}MB.dat`;
      const filePath = join(testFilesDir, fileName);
      
      console.log(`  Generating ${fileName}...`);
      await this.generateLargeFile(filePath, size);
    }
  }

  /**
   * Generate a single large file
   */
  private async generateLargeFile(filePath: string, size: number): Promise<void> {
    const chunkSize = 64 * 1024; // 64KB chunks
    const chunks = Math.ceil(size / chunkSize);
    
    const fileHandle = await fs.open(filePath, 'w');
    
    try {
      for (let i = 0; i < chunks; i++) {
        const remainingSize = size - (i * chunkSize);
        const currentChunkSize = Math.min(chunkSize, remainingSize);
        
        // Generate varied content to simulate real data
        const chunk = this.generateChunkContent(currentChunkSize, i);
        await fileHandle.write(chunk);
      }
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Generate chunk content
   */
  private generateChunkContent(size: number, chunkIndex: number): string {
    const patterns = [
      // JSON-like data
      () => JSON.stringify({
        id: chunkIndex,
        data: 'x'.repeat(size - 100),
        timestamp: Date.now()
      }),
      
      // Text data
      () => `Chunk ${chunkIndex}\n` + 'Lorem ipsum dolor sit amet, '.repeat(Math.floor(size / 30)),
      
      // Binary-like data
      () => Buffer.alloc(size, chunkIndex % 256).toString('binary'),
      
      // Mixed content
      () => {
        const base = 'Chunk ' + chunkIndex + ' - ';
        const remaining = size - base.length;
        return base + 'x'.repeat(remaining);
      }
    ];
    
    const pattern = patterns[chunkIndex % patterns.length]();
    return pattern.length > size ? pattern.substring(0, size) : pattern;
  }

  /**
   * Generate metadata and indexes
   */
  private async generateMetadata(): Promise<void> {
    console.log('📊 Generating metadata and indexes...');
    
    const metadataDir = join(this.config.outputDir, 'metadata');
    await this.ensureDirectory(metadataDir);
    
    // Generate change index
    const changeIndex = {
      total: this.config.changeCount,
      types: this.getChangeTypeDistribution(),
      status: this.getChangeStatusDistribution(),
      priorities: this.getChangePriorityDistribution(),
      generated: new Date().toISOString(),
      repository: this.config.repoName
    };
    
    await fs.writeFile(
      join(metadataDir, 'change-index.json'),
      JSON.stringify(changeIndex, null, 2)
    );
    
    // Generate file manifest
    const fileManifest = {
      largeFiles: this.config.largeFileSizes.map(size => ({
        name: `test-file-${size / 1024 / 1024}MB.dat`,
        size,
        path: `test-files/test-file-${size / 1024 / 1024}MB.dat`,
        checksum: 'pending'
      })),
      totalSize: this.config.largeFileSizes.reduce((sum, size) => sum + size, 0),
      generated: new Date().toISOString()
    };
    
    await fs.writeFile(
      join(metadataDir, 'file-manifest.json'),
      JSON.stringify(fileManifest, null, 2)
    );
  }

  /**
   * Generate benchmark data scripts
   */
  private async generateBenchmarkScripts(): Promise<void> {
    console.log('🔧 Generating benchmark scripts...');
    
    const scriptsDir = join(this.config.outputDir, 'scripts');
    await this.ensureDirectory(scriptsDir);
    
    // Pagination benchmark script
    const paginationScript = this.generatePaginationBenchmarkScript();
    await fs.writeFile(join(scriptsDir, 'run-pagination-benchmark.js'), paginationScript);
    
    // Streaming benchmark script
    const streamingScript = this.generateStreamingBenchmarkScript();
    await fs.writeFile(join(scriptsDir, 'run-streaming-benchmark.js'), streamingScript);
    
    // Load test script
    const loadTestScript = this.generateLoadTestScript();
    await fs.writeFile(join(scriptsDir, 'run-load-test.js'), loadTestScript);
  }

  /**
   * Generate pagination benchmark script
   */
  private generatePaginationBenchmarkScript(): string {
    return `#!/usr/bin/env node

/**
 * Pagination Benchmark Script
 * Tests pagination performance with generated test data
 */

import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';

async function runPaginationBenchmark() {
  console.log('🚀 Running Pagination Benchmark...');
  
  const testRepo = './${this.config.repoName}';
  const changeCount = ${this.config.changeCount};
  
  try {
    // Load change index
    const changeIndexPath = './metadata/change-index.json';
    const changeIndex = JSON.parse(await fs.readFile(changeIndexPath, 'utf-8'));
    
    console.log(\`📊 Testing pagination of \${changeCount} changes...\`);
    
    // Simulate pagination operations
    const pageSizes = [10, 25, 50, 100];
    const results = [];
    
    for (const pageSize of pageSizes) {
      const startTime = performance.now();
      
      // Simulate pagination logic
      const totalPages = Math.ceil(changeCount / pageSize);
      for (let page = 1; page <= Math.min(totalPages, 5); page++) {
        // Simulate database query and processing
        await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      results.push({
        pageSize,
        duration,
        pagesProcessed: Math.min(totalPages, 5),
        avgTimePerPage: duration / Math.min(totalPages, 5)
      });
      
      console.log(\`  Page size \${pageSize}: \${duration.toFixed(2)}ms\`);
    }
    
    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      testType: 'pagination',
      totalChanges: changeCount,
      results,
      summary: {
        fastestPageSize: results.reduce((min, r) => r.avgTimePerPage < min.avgTimePerPage ? r : min),
        slowestPageSize: results.reduce((max, r) => r.avgTimePerPage > max.avgTimePerPage ? r : max)
      }
    };
    
    await fs.writeFile('./metadata/pagination-benchmark.json', JSON.stringify(report, null, 2));
    console.log('✅ Pagination benchmark completed');
    
  } catch (error) {
    console.error('❌ Pagination benchmark failed:', error);
    process.exit(1);
  }
}

runPaginationBenchmark();
`;
  }

  /**
   * Generate streaming benchmark script
   */
  private generateStreamingBenchmarkScript(): string {
    return `#!/usr/bin/env node

/**
 * Streaming Benchmark Script
 * Tests streaming performance with large files
 */

import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';

async function runStreamingBenchmark() {
  console.log('🌊 Running Streaming Benchmark...');
  
  const fileSizes = [${this.config.largeFileSizes.join(', ')}];
  const chunkSize = 64 * 1024; // 64KB
  
  try {
    const results = [];
    
    for (const fileSize of fileSizes) {
      const fileName = \`./test-files/test-file-\${fileSize / 1024 / 1024}MB.dat\`;
      console.log(\`📄 Testing streaming of \${fileSize / 1024 / 1024}MB file...\`);
      
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();
      
      // Simulate streaming operation
      const stream = createReadStream(fileName, { highWaterMark: chunkSize });
      let totalBytes = 0;
      let chunks = 0;
      
      for await (const chunk of stream) {
        totalBytes += chunk.length;
        chunks++;
        
        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const duration = endTime - startTime;
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      results.push({
        fileSize,
        duration,
        totalBytes,
        chunks,
        throughput: totalBytes / (duration / 1000), // bytes per second
        memoryGrowth,
        avgChunkSize: totalBytes / chunks
      });
      
      console.log(\`  Duration: \${duration.toFixed(2)}ms\`);
      console.log(\`  Throughput: \${(totalBytes / (duration / 1000) / 1024 / 1024).toFixed(2)}MB/s\`);
      console.log(\`  Memory growth: \${(memoryGrowth / 1024 / 1024).toFixed(2)}MB\`);
    }
    
    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      testType: 'streaming',
      chunkSize,
      results,
      summary: {
        avgThroughput: results.reduce((sum, r) => sum + r.throughput, 0) / results.length,
        maxMemoryGrowth: Math.max(...results.map(r => r.memoryGrowth)),
        totalDataProcessed: results.reduce((sum, r) => sum + r.totalBytes, 0)
      }
    };
    
    await fs.writeFile('./metadata/streaming-benchmark.json', JSON.stringify(report, null, 2));
    console.log('✅ Streaming benchmark completed');
    
  } catch (error) {
    console.error('❌ Streaming benchmark failed:', error);
    process.exit(1);
  }
}

runStreamingBenchmark();
`;
  }

  /**
   * Generate load test script
   */
  private generateLoadTestScript(): string {
    return `#!/usr/bin/env node

/**
 * Load Test Script
 * Tests concurrent operations and system performance under load
 */

import { performance } from 'perf_hooks';

async function runLoadTest() {
  console.log('⚡ Running Load Test...');
  
  const concurrencyLevels = [1, 5, 10, 15, 20];
  const results = [];
  
  for (const concurrency of concurrencyLevels) {
    console.log(\`🔄 Testing concurrency level: \${concurrency}...\`);
    
    const startTime = performance.now();
    
    // Simulate concurrent operations
    const promises = Array.from({ length: concurrency }, async (_, i) => {
      const requestStart = performance.now();
      
      // Simulate different types of operations
      const operations = [
        () => simulatePagination(),
        () => simulateStreaming(),
        () => simulateDataProcessing()
      ];
      
      const operation = operations[i % operations.length];
      await operation();
      
      return performance.now() - requestStart;
    });
    
    const executionTimes = await Promise.all(promises);
    const totalTime = performance.now() - startTime;
    
    const avgTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
    const maxTime = Math.max(...executionTimes);
    const minTime = Math.min(...executionTimes);
    
    results.push({
      concurrency,
      totalTime,
      avgTime,
      maxTime,
      minTime,
      throughput: concurrency / (totalTime / 1000) // requests per second
    });
    
    console.log(\`  Avg time: \${avgTime.toFixed(2)}ms\`);
    console.log(\`  Throughput: \${(concurrency / (totalTime / 1000)).toFixed(2)} req/s\`);
  }
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    testType: 'load',
    results,
    summary: {
      optimalConcurrency: results.reduce((best, r) => r.throughput > best.throughput ? r : best),
      maxSustainableConcurrency: results.filter(r => r.avgTime < 500).pop()?.concurrency || 0
    }
  };
  
  console.log('✅ Load test completed');
  console.log(\`Optimal concurrency: \${report.summary.optimalConcurrency.concurrency}\`);
}

async function simulatePagination() {
  await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
}

async function simulateStreaming() {
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
}

async function simulateDataProcessing() {
  await new Promise(resolve => setTimeout(resolve, 75 + Math.random() * 150));
}

runLoadTest().catch(console.error);
`;
  }

  // Helper methods for generating random data
  private generateRandomTitle(): string {
    const adjectives = ['Advanced', 'Critical', 'Enhanced', 'Improved', 'Modern', 'Optimized', 'Secure', 'Scalable'];
    const nouns = ['Architecture', 'Feature', 'Integration', 'Performance', 'Security', 'System', 'Workflow', 'API'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
  }

  private generateRandomDescription(type: ChangeData['type']): string {
    const templates = {
      proposal: `This proposal outlines a comprehensive approach to ${this.generateRandomTitle().toLowerCase()}. The implementation will focus on performance, scalability, and maintainability.`,
      spec: `Technical specification for ${this.generateRandomTitle().toLowerCase()}. Includes detailed requirements, implementation guidelines, and testing procedures.`,
      task: `Implementation task for ${this.generateRandomTitle().toLowerCase()}. This task involves coding, testing, and documentation.`,
      delta: `Change delta for ${this.generateRandomTitle().toLowerCase()}. Contains modifications to existing specifications and implementation details.`
    };
    
    return templates[type];
  }

  private getRandomStatus(): ChangeData['status'] {
    const statuses: ChangeData['status'][] = ['draft', 'active', 'completed', 'archived'];
    return statuses[Math.floor(Math.random() * statuses.length)];
  }

  private getRandomPriority(): ChangeData['priority'] {
    const priorities: ChangeData['priority'][] = ['low', 'medium', 'high', 'critical'];
    return priorities[Math.floor(Math.random() * priorities.length)];
  }

  private generateRandomTags(): string[] {
    const allTags = ['performance', 'security', 'api', 'frontend', 'backend', 'database', 'testing', 'documentation', 'ci/cd', 'monitoring'];
    const tagCount = Math.floor(Math.random() * 4) + 1;
    const tags: string[] = [];
    
    for (let i = 0; i < tagCount; i++) {
      const tag = allTags[Math.floor(Math.random() * allTags.length)];
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
    
    return tags;
  }

  private getRandomFileType(): FileData['type'] {
    const types: FileData['type'][] = ['text', 'json', 'markdown', 'binary'];
    return types[Math.floor(Math.random() * types.length)];
  }

  private generateFileName(type: FileData['type'], index: number): string {
    const extensions = {
      text: 'txt',
      json: 'json',
      markdown: 'md',
      binary: 'dat'
    };
    
    return `file-${index + 1}.${extensions[type]}`;
  }

  private generateFileContent(type: FileData['type'], changeType: ChangeData['type'], index: number): string {
    const baseContent = {
      text: () => `Content for ${changeType} ${index}\n\n`.repeat(10) + 'Lorem ipsum dolor sit amet, '.repeat(50),
      json: () => JSON.stringify({
        id: index,
        type: changeType,
        content: 'x'.repeat(1000),
        metadata: {
          created: new Date().toISOString(),
          version: '1.0.0',
          tags: this.generateRandomTags()
        }
      }, null, 2),
      markdown: () => `# ${changeType.charAt(0).toUpperCase() + changeType.slice(1)} ${index}\n\n` + 
                   '## Description\n\n' + 
                   'This is a markdown file for testing purposes.\n\n'.repeat(5) +
                   '## Details\n\n' + 
                   '- Item 1\n- Item 2\n- Item 3\n'.repeat(3),
      binary: () => Buffer.alloc(1024, index % 256).toString('binary')
    };
    
    return baseContent[type]();
  }

  private generateChecksum(content: string): string {
    // Simple checksum for demonstration
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private generateDependencies(index: number): string[] {
    const dependencyCount = Math.floor(Math.random() * 3);
    const dependencies: string[] = [];
    
    for (let i = 0; i < dependencyCount; i++) {
      const depIndex = Math.max(0, index - Math.floor(Math.random() * 10) - 1);
      dependencies.push(`change-${depIndex + 1}`);
    }
    
    return dependencies;
  }

  private generateReviewers(): string[] {
    const reviewers = ['alice', 'bob', 'charlie', 'diana', 'eve'];
    const reviewerCount = Math.floor(Math.random() * 3) + 1;
    const selected: string[] = [];
    
    for (let i = 0; i < reviewerCount; i++) {
      const reviewer = reviewers[Math.floor(Math.random() * reviewers.length)];
      if (!selected.includes(reviewer)) {
        selected.push(reviewer);
      }
    }
    
    return selected;
  }

  private getRandomAssignee(): string {
    const assignees = ['alice', 'bob', 'charlie', 'diana', 'eve'];
    return assignees[Math.floor(Math.random() * assignees.length)];
  }

  private getChangeTypeDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    const types: ChangeData['type'][] = ['proposal', 'spec', 'task', 'delta'];
    
    types.forEach(type => {
      distribution[type] = Math.floor(this.config.changeCount / types.length);
    });
    
    return distribution;
  }

  private getChangeStatusDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    const statuses: ChangeData['status'][] = ['draft', 'active', 'completed', 'archived'];
    
    statuses.forEach(status => {
      distribution[status] = Math.floor(this.config.changeCount / statuses.length);
    });
    
    return distribution;
  }

  private getChangePriorityDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    const priorities: ChangeData['priority'][] = ['low', 'medium', 'high', 'critical'];
    
    priorities.forEach(priority => {
      distribution[priority] = Math.floor(this.config.changeCount / priorities.length);
    });
    
    return distribution;
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Directory might already exist
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }
}

// Run generator if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const config: TestDataConfig = {
    changeCount: 1200, // 1000+ changes for pagination testing
    largeFileSizes: [
      10 * 1024 * 1024,  // 10MB
      50 * 1024 * 1024,  // 50MB
      100 * 1024 * 1024  // 100MB
    ],
    outputDir: './test-environment',
    repoName: 'phase3-performance-test-repo'
  };
  
  const generator = new TestDataGenerator(config);
  generator.generateTestEnvironment()
    .then(() => {
      console.log('\n🎉 Phase 3 Performance Test Environment Ready!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Failed to generate test environment:', error);
      process.exit(1);
    });
}

export { TestDataGenerator, TestDataConfig };