/**
 * Example JavaScript file for Sample Repository
 * 
 * This file demonstrates a simple Node.js application structure
 * that could be managed using Task MCP and OpenSpec.
 */

console.log('Sample Repository - Example Application');
console.log('This demonstrates Task MCP integration with OpenSpec');

// Example function that could be part of a feature change
function processChange(changeData) {
  console.log('Processing change:', changeData.slug);
  
  // Simulate processing
  return {
    success: true,
    message: `Change ${changeData.slug} processed successfully`,
    timestamp: new Date().toISOString()
  };
}

// Example usage
if (require.main === module) {
  const exampleChange = {
    slug: 'example-feature',
    type: 'feature',
    title: 'Add example feature to demonstrate Task MCP'
  };
  
  const result = processChange(exampleChange);
  console.log(result);
}

module.exports = { processChange };