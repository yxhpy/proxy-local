import { strict as assert } from 'assert';
import { TunnelProvider, ProviderManager, TunnelResult, ProviderFeatures } from '../src/providers/index.js';

/**
 * Mock Provider Implementation for Testing
 */
class MockProvider extends TunnelProvider {
  constructor(name = 'mock', shouldSucceed = true, features = {}) {
    const defaultFeatures = new ProviderFeatures({
      requiresConfirmation: false,
      speed: 'fast',
      httpsSupport: true,
      customDomain: false,
      description: 'Mock provider for testing'
    });
    
    super(name, { ...defaultFeatures, ...features });
    this.shouldSucceed = shouldSucceed;
    this.createTunnelCalled = false;
    this.isAvailableCalled = false;
  }

  async createTunnel(port) {
    this.createTunnelCalled = true;
    if (!this.shouldSucceed) {
      throw new Error(`Mock provider ${this.name} intentionally failed`);
    }
    return new TunnelResult(`https://${this.name}.example.com`, this.name, this.features);
  }

  async isAvailable() {
    this.isAvailableCalled = true;
    return this.shouldSucceed;
  }
}

/**
 * Test Suite for ProviderManager
 */
async function runProviderManagerTests() {
  console.log('🧪 Running ProviderManager Tests...');
  
  // Test 1: Provider Registration
  await testProviderRegistration();
  
  // Test 2: Provider Retrieval
  await testProviderRetrieval();
  
  // Test 3: Default Provider Management
  await testDefaultProviderManagement();
  
  // Test 4: Fallback Mechanism
  await testFallbackMechanism();
  
  // Test 5: Provider Selection
  await testProviderSelection();

  console.log('✅ All ProviderManager tests passed!');
}

async function testProviderRegistration() {
  console.log('  📋 Testing provider registration...');
  
  const manager = new ProviderManager();
  const mockProvider = new MockProvider('test-provider');
  
  // Test registration
  manager.register(mockProvider);
  assert.equal(manager.getAllProviders().length, 1, 'Should have 1 provider after registration');
  assert.equal(manager.getProvider('test-provider'), mockProvider, 'Should retrieve registered provider');
  
  // Test invalid provider registration
  try {
    manager.register('invalid-provider');
    assert.fail('Should throw error for invalid provider');
  } catch (error) {
    assert.ok(error.message.includes('Provider must extend TunnelProvider'), 'Should throw correct error message');
  }
  
  console.log('    ✓ Provider registration works correctly');
}

async function testProviderRetrieval() {
  console.log('  📋 Testing provider retrieval...');
  
  const manager = new ProviderManager();
  const provider1 = new MockProvider('provider1');
  const provider2 = new MockProvider('provider2');
  
  manager.register(provider1);
  manager.register(provider2);
  
  // Test retrieval
  assert.equal(manager.getProvider('provider1'), provider1, 'Should retrieve provider1');
  assert.equal(manager.getProvider('provider2'), provider2, 'Should retrieve provider2');
  assert.equal(manager.getProvider('nonexistent'), null, 'Should return null for nonexistent provider');
  
  // Test getAllProviders
  const allProviders = manager.getAllProviders();
  assert.equal(allProviders.length, 2, 'Should return all registered providers');
  assert.ok(allProviders.includes(provider1), 'Should include provider1');
  assert.ok(allProviders.includes(provider2), 'Should include provider2');
  
  console.log('    ✓ Provider retrieval works correctly');
}

async function testDefaultProviderManagement() {
  console.log('  📋 Testing default provider management...');
  
  const manager = new ProviderManager();
  const provider1 = new MockProvider('provider1');
  const provider2 = new MockProvider('provider2');
  const provider3 = new MockProvider('provider3');
  
  // Test first provider becomes default
  manager.register(provider1);
  let defaults = manager.getDefaultProviders();
  assert.deepEqual(defaults, ['provider1'], 'First provider should be default');
  
  // Test adding more providers
  manager.register(provider2);
  manager.register(provider3, true); // Set as default
  
  defaults = manager.getDefaultProviders();
  assert.equal(defaults[0], 'provider3', 'provider3 should be first (highest priority)');
  assert.ok(defaults.includes('provider1'), 'Should still include provider1');
  assert.ok(defaults.includes('provider2'), 'Should still include provider2');
  
  // Test setDefaultPriority
  manager.setDefaultPriority(['provider2', 'provider1', 'provider3']);
  defaults = manager.getDefaultProviders();
  assert.deepEqual(defaults, ['provider2', 'provider1', 'provider3'], 'Should set custom priority order');
  
  console.log('    ✓ Default provider management works correctly');
}

async function testFallbackMechanism() {
  console.log('  📋 Testing fallback mechanism...');
  
  const manager = new ProviderManager();
  const failingProvider = new MockProvider('failing', false);
  const workingProvider = new MockProvider('working', true);
  
  manager.register(failingProvider);
  manager.register(workingProvider);
  
  // Test fallback when first provider fails
  const result = await manager.createTunnelWithFallback(3000);
  
  // The manager checks isAvailable first, so if isAvailable returns false, 
  // createTunnel may not be called. Let's check the correct behavior:
  assert.ok(failingProvider.isAvailableCalled, 'Should check failing provider availability first');
  assert.ok(workingProvider.createTunnelCalled, 'Should use working provider');
  assert.equal(result.provider, 'working', 'Should return result from working provider');
  assert.equal(manager.getCurrentProvider(), workingProvider, 'Should set current provider to working one');
  
  console.log('    ✓ Fallback mechanism works correctly');
}

async function testProviderSelection() {
  console.log('  📋 Testing provider selection...');
  
  const manager = new ProviderManager();
  const provider1 = new MockProvider('provider1');
  const provider2 = new MockProvider('provider2');
  
  manager.register(provider1);
  manager.register(provider2);
  
  // Test selecting specific provider
  const selectedProvider = manager.selectProvider('provider2');
  assert.equal(selectedProvider, provider2, 'Should select specified provider');
  assert.equal(manager.getCurrentProvider(), provider2, 'Should set as current provider');
  
  // Test selecting nonexistent provider (should fallback to default)
  const fallbackProvider = manager.selectProvider('nonexistent');
  assert.ok(fallbackProvider !== null, 'Should fallback to default provider');
  
  // Test selecting without preference (should use default priority)
  const defaultProvider = manager.selectProvider();
  assert.ok(defaultProvider !== null, 'Should select default provider');
  
  console.log('    ✓ Provider selection works correctly');
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runProviderManagerTests().catch(console.error);
}

export { runProviderManagerTests, MockProvider };