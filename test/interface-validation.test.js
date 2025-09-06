import { strict as assert } from 'assert';
import { TunnelProvider, TunnelResult, ProviderFeatures } from '../src/providers/index.js';

/**
 * Test Suite for TunnelProvider Interface Validation
 */
async function runInterfaceValidationTests() {
  console.log('🧪 Running Interface Validation Tests...');
  
  // Test 1: TunnelProvider Abstract Class
  await testTunnelProviderAbstractClass();
  
  // Test 2: TunnelResult Class
  await testTunnelResultClass();
  
  // Test 3: ProviderFeatures Class
  await testProviderFeaturesClass();
  
  // Test 4: Interface Compliance
  await testInterfaceCompliance();

  console.log('✅ All Interface Validation tests passed!');
}

async function testTunnelProviderAbstractClass() {
  console.log('  📋 Testing TunnelProvider abstract class...');
  
  // Test 1: Cannot instantiate abstract class directly
  try {
    new TunnelProvider('test');
    assert.fail('Should not be able to instantiate TunnelProvider directly');
  } catch (error) {
    assert.ok(error.message.includes('abstract class'), 'Should throw abstract class error');
  }
  
  // Test 2: Subclass must implement createTunnel
  class IncompleteProvider extends TunnelProvider {
    constructor() {
      super('incomplete', new ProviderFeatures());
    }
    // Missing createTunnel implementation
  }
  
  const incompleteProvider = new IncompleteProvider();
  
  try {
    await incompleteProvider.createTunnel(3000);
    assert.fail('Should throw error for unimplemented createTunnel');
  } catch (error) {
    assert.ok(error.message.includes('must be implemented'), 'Should throw implementation error');
  }
  
  // Test 3: Default isAvailable implementation
  const isAvailable = await incompleteProvider.isAvailable();
  assert.equal(isAvailable, true, 'Default isAvailable should return true');
  
  // Test 4: getFeatures should return features
  const features = incompleteProvider.getFeatures();
  assert.ok(features instanceof ProviderFeatures, 'Should return ProviderFeatures instance');
  
  console.log('    ✓ TunnelProvider abstract class validation works correctly');
}

async function testTunnelResultClass() {
  console.log('  📋 Testing TunnelResult class...');
  
  const features = new ProviderFeatures({
    speed: 'fast',
    httpsSupport: true
  });
  
  const result = new TunnelResult('https://test.example.com', 'test-provider', features);
  
  // Test properties
  assert.equal(result.url, 'https://test.example.com', 'Should store URL correctly');
  assert.equal(result.provider, 'test-provider', 'Should store provider name correctly');
  assert.equal(result.features, features, 'Should store features correctly');
  assert.ok(result.createdAt instanceof Date, 'Should set createdAt timestamp');
  
  // Test creation without features
  const resultNoFeatures = new TunnelResult('https://test2.example.com', 'test-provider2');
  assert.equal(resultNoFeatures.url, 'https://test2.example.com', 'Should work without features');
  assert.deepEqual(resultNoFeatures.features, {}, 'Features should be empty object when not provided');
  
  console.log('    ✓ TunnelResult class validation works correctly');
}

async function testProviderFeaturesClass() {
  console.log('  📋 Testing ProviderFeatures class...');
  
  // Test 1: Default construction
  const defaultFeatures = new ProviderFeatures();
  assert.equal(defaultFeatures.requiresConfirmation, false, 'Default requiresConfirmation should be false');
  assert.equal(defaultFeatures.speed, 'medium', 'Default speed should be medium');
  assert.equal(defaultFeatures.httpsSupport, true, 'Default httpsSupport should be true');
  assert.equal(defaultFeatures.customDomain, false, 'Default customDomain should be false');
  assert.equal(defaultFeatures.description, '', 'Default description should be empty');
  
  // Test 2: Custom construction
  const customFeatures = new ProviderFeatures({
    requiresConfirmation: true,
    speed: 'fast',
    httpsSupport: false,
    customDomain: true,
    description: 'Custom provider features'
  });
  
  assert.equal(customFeatures.requiresConfirmation, true, 'Should set custom requiresConfirmation');
  assert.equal(customFeatures.speed, 'fast', 'Should set custom speed');
  assert.equal(customFeatures.httpsSupport, false, 'Should set custom httpsSupport');
  assert.equal(customFeatures.customDomain, true, 'Should set custom customDomain');
  assert.equal(customFeatures.description, 'Custom provider features', 'Should set custom description');
  
  // Test 3: Partial construction
  const partialFeatures = new ProviderFeatures({
    speed: 'slow',
    description: 'Partial features'
  });
  
  assert.equal(partialFeatures.requiresConfirmation, false, 'Should use default for unspecified properties');
  assert.equal(partialFeatures.speed, 'slow', 'Should use custom value for specified properties');
  assert.equal(partialFeatures.httpsSupport, true, 'Should use default for unspecified properties');
  assert.equal(partialFeatures.description, 'Partial features', 'Should use custom value for specified properties');
  
  console.log('    ✓ ProviderFeatures class validation works correctly');
}

async function testInterfaceCompliance() {
  console.log('  📋 Testing interface compliance...');
  
  // Test 1: Complete Provider Implementation
  class CompleteProvider extends TunnelProvider {
    constructor() {
      super('complete', new ProviderFeatures({
        speed: 'fast',
        description: 'Complete test provider'
      }));
    }
    
    async createTunnel(port) {
      return new TunnelResult(`https://complete-${port}.example.com`, this.name, this.features);
    }
    
    async isAvailable() {
      return true;
    }
    
    async closeTunnel() {
      // Custom implementation
      return Promise.resolve();
    }
  }
  
  const completeProvider = new CompleteProvider();
  
  // Test all required methods exist and work
  assert.equal(completeProvider.name, 'complete', 'Should have correct name');
  assert.ok(completeProvider.features instanceof ProviderFeatures, 'Should have features');
  
  const isAvailable = await completeProvider.isAvailable();
  assert.equal(isAvailable, true, 'isAvailable should work');
  
  const result = await completeProvider.createTunnel(8080);
  assert.ok(result instanceof TunnelResult, 'createTunnel should return TunnelResult');
  assert.equal(result.url, 'https://complete-8080.example.com', 'Should return correct URL');
  assert.equal(result.provider, 'complete', 'Should return correct provider name');
  
  const features = completeProvider.getFeatures();
  assert.equal(features.speed, 'fast', 'Should return correct features');
  
  await completeProvider.closeTunnel(); // Should not throw
  
  console.log('    ✓ Interface compliance validation works correctly');
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runInterfaceValidationTests().catch(console.error);
}

export { runInterfaceValidationTests };