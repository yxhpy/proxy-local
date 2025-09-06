import { strict as assert } from 'assert';
import { ProviderManager, TunnelProvider, TunnelResult, ProviderFeatures } from '../src/providers/index.js';

/**
 * Mock Provider for testing fallback scenarios
 */
class TestProvider extends TunnelProvider {
  constructor(name, shouldSucceed = true, shouldBeAvailable = true, customError = null) {
    const features = new ProviderFeatures({
      requiresConfirmation: false,
      speed: 'fast',
      httpsSupport: true,
      description: `Test provider ${name}`
    });
    
    super(name, features);
    this.shouldSucceed = shouldSucceed;
    this.shouldBeAvailable = shouldBeAvailable;
    this.customError = customError;
    this.createTunnelCalled = false;
    this.isAvailableCalled = false;
  }

  async createTunnel(port) {
    this.createTunnelCalled = true;
    if (!this.shouldSucceed) {
      if (this.customError) {
        throw new Error(this.customError);
      }
      throw new Error(`Test provider ${this.name} intentionally failed`);
    }
    return new TunnelResult(`https://${this.name}.test.com`, this.name, this.features);
  }

  async isAvailable() {
    this.isAvailableCalled = true;
    return this.shouldBeAvailable;
  }
}

/**
 * Test Suite for Fallback Mechanism
 */
async function runFallbackMechanismTests() {
  console.log('🧪 Running Fallback Mechanism Tests...');
  
  // Test 1: Successful Primary Provider
  await testSuccessfulPrimaryProvider();
  
  // Test 2: Primary Fails, Fallback Succeeds
  await testPrimaryFailsFallbackSucceeds();
  
  // Test 3: Multiple Providers Fail
  await testMultipleProvidersFail();
  
  // Test 4: Provider Unavailable vs Failed
  await testProviderUnavailableVsFailed();
  
  // Test 5: Preferred Provider Logic
  await testPreferredProviderLogic();
  
  // Test 6: All Providers Fail
  await testAllProvidersFail();

  console.log('✅ All Fallback Mechanism tests passed!');
}

async function testSuccessfulPrimaryProvider() {
  console.log('  📋 Testing successful primary provider...');
  
  const manager = new ProviderManager();
  const primaryProvider = new TestProvider('primary', true);
  const fallbackProvider = new TestProvider('fallback', true);
  
  manager.register(primaryProvider, true); // Set as default
  manager.register(fallbackProvider);
  
  const result = await manager.createTunnelWithFallback(8080);
  
  assert.ok(primaryProvider.createTunnelCalled, 'Should try primary provider');
  assert.ok(!fallbackProvider.createTunnelCalled, 'Should not try fallback if primary succeeds');
  assert.equal(result.provider, 'primary', 'Should return result from primary provider');
  assert.equal(manager.getCurrentProvider(), primaryProvider, 'Should set current provider to primary');
  
  console.log('    ✓ Successful primary provider works correctly');
}

async function testPrimaryFailsFallbackSucceeds() {
  console.log('  📋 Testing primary fails, fallback succeeds...');
  
  const manager = new ProviderManager();
  const failingProvider = new TestProvider('failing', false, true, 'Connection timeout');
  const workingProvider = new TestProvider('working', true);
  
  manager.register(failingProvider, true); // Set as default
  manager.register(workingProvider);
  
  const result = await manager.createTunnelWithFallback(8080);
  
  assert.ok(failingProvider.createTunnelCalled, 'Should try failing provider first');
  assert.ok(workingProvider.createTunnelCalled, 'Should try working provider after failure');
  assert.equal(result.provider, 'working', 'Should return result from working provider');
  assert.equal(manager.getCurrentProvider(), workingProvider, 'Should set current provider to working');
  
  console.log('    ✓ Primary fails, fallback succeeds works correctly');
}

async function testMultipleProvidersFail() {
  console.log('  📋 Testing multiple providers fail...');
  
  const manager = new ProviderManager();
  const provider1 = new TestProvider('provider1', false, true, 'Error 1');
  const provider2 = new TestProvider('provider2', false, true, 'Error 2');
  const workingProvider = new TestProvider('working', true);
  
  manager.register(provider1, true); // Set as default
  manager.register(provider2);
  manager.register(workingProvider);
  
  const result = await manager.createTunnelWithFallback(8080);
  
  assert.ok(provider1.createTunnelCalled, 'Should try first provider');
  assert.ok(provider2.createTunnelCalled, 'Should try second provider');
  assert.ok(workingProvider.createTunnelCalled, 'Should try working provider');
  assert.equal(result.provider, 'working', 'Should return result from working provider');
  
  console.log('    ✓ Multiple providers fail scenario works correctly');
}

async function testProviderUnavailableVsFailed() {
  console.log('  📋 Testing provider unavailable vs failed...');
  
  const manager = new ProviderManager();
  const unavailableProvider = new TestProvider('unavailable', true, false); // Available=false
  const failedProvider = new TestProvider('failed', false, true); // Available=true, but fails
  const workingProvider = new TestProvider('working', true, true);
  
  manager.register(unavailableProvider, true);
  manager.register(failedProvider);
  manager.register(workingProvider);
  
  const result = await manager.createTunnelWithFallback(8080);
  
  assert.ok(unavailableProvider.isAvailableCalled, 'Should check unavailable provider availability');
  assert.ok(!unavailableProvider.createTunnelCalled, 'Should not call createTunnel on unavailable provider');
  assert.ok(failedProvider.isAvailableCalled, 'Should check failed provider availability');
  assert.ok(failedProvider.createTunnelCalled, 'Should call createTunnel on available but failing provider');
  assert.ok(workingProvider.createTunnelCalled, 'Should call createTunnel on working provider');
  assert.equal(result.provider, 'working', 'Should return result from working provider');
  
  console.log('    ✓ Provider unavailable vs failed logic works correctly');
}

async function testPreferredProviderLogic() {
  console.log('  📋 Testing preferred provider logic...');
  
  const manager = new ProviderManager();
  const defaultProvider = new TestProvider('default', true);
  const preferredProvider = new TestProvider('preferred', true);
  const otherProvider = new TestProvider('other', true);
  
  manager.register(defaultProvider, true); // Set as default
  manager.register(preferredProvider);
  manager.register(otherProvider);
  
  // Test with preferred provider
  const result = await manager.createTunnelWithFallback(8080, 'preferred');
  
  assert.ok(preferredProvider.createTunnelCalled, 'Should try preferred provider first');
  assert.ok(!defaultProvider.createTunnelCalled, 'Should not try default when preferred succeeds');
  assert.equal(result.provider, 'preferred', 'Should return result from preferred provider');
  
  console.log('    ✓ Preferred provider logic works correctly');
}

async function testAllProvidersFail() {
  console.log('  📋 Testing all providers fail...');
  
  const manager = new ProviderManager();
  const provider1 = new TestProvider('provider1', false, true, 'Error 1');
  const provider2 = new TestProvider('provider2', false, true, 'Error 2');
  const provider3 = new TestProvider('provider3', false, false); // Unavailable
  
  manager.register(provider1, true);
  manager.register(provider2);
  manager.register(provider3);
  
  try {
    await manager.createTunnelWithFallback(8080);
    assert.fail('Should throw error when all providers fail');
  } catch (error) {
    assert.ok(error.message.includes('All tunnel providers failed'), 'Should provide summary error');
    assert.ok(error.message.includes('Error 1'), 'Should include provider1 error');
    assert.ok(error.message.includes('Error 2'), 'Should include provider2 error');
    assert.ok(error.message.includes('not available'), 'Should include unavailable provider info');
  }
  
  assert.ok(provider1.createTunnelCalled, 'Should try provider1');
  assert.ok(provider2.createTunnelCalled, 'Should try provider2');
  assert.ok(provider3.isAvailableCalled, 'Should check provider3 availability');
  assert.ok(!provider3.createTunnelCalled, 'Should not try unavailable provider3');
  
  console.log('    ✓ All providers fail scenario works correctly');
}

/**
 * Test error message formatting
 */
async function testErrorMessageFormatting() {
  console.log('  📋 Testing error message formatting...');
  
  const manager = new ProviderManager();
  const provider1 = new TestProvider('provider1', false, true, 'Connection refused');
  const provider2 = new TestProvider('provider2', false, false);
  
  manager.register(provider1, true);
  manager.register(provider2);
  
  try {
    await manager.createTunnelWithFallback(8080);
    assert.fail('Should throw error');
  } catch (error) {
    const message = error.message;
    assert.ok(message.includes('All tunnel providers failed'), 'Should have failure summary');
    assert.ok(message.includes('provider1'), 'Should list provider1');
    assert.ok(message.includes('provider2'), 'Should list provider2');
    assert.ok(message.includes('Connection refused'), 'Should include specific error');
    assert.ok(message.includes('not available'), 'Should include availability info');
  }
  
  console.log('    ✓ Error message formatting works correctly');
}

// Run additional tests
async function runAdditionalTests() {
  await testErrorMessageFormatting();
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runFallbackMechanismTests()
    .then(() => runAdditionalTests())
    .catch(console.error);
}

export { runFallbackMechanismTests };