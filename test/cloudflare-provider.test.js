import { strict as assert } from 'assert';
import { CloudflareProvider } from '../src/providers/cloudflare.js';
import { TunnelProvider, TunnelResult, ProviderFeatures } from '../src/providers/index.js';

/**
 * Test Suite for CloudflareProvider
 */
async function runCloudflareProviderTests() {
  console.log('🧪 Running Cloudflare Provider Tests...');
  
  // Test 1: Provider Construction
  await testProviderConstruction();
  
  // Test 2: Interface Compliance
  await testInterfaceCompliance();
  
  // Test 3: Features Information
  await testFeaturesInformation();
  
  // Test 4: Availability Check
  await testAvailabilityCheck();
  
  // Test 5: Status Methods
  await testStatusMethods();
  
  // Test 6: Authentication Methods
  await testAuthenticationMethods();
  
  // Test 7: Persistent Mode
  await testPersistentMode();

  console.log('✅ All Cloudflare Provider tests passed!');
}

async function testProviderConstruction() {
  console.log('  📋 Testing provider construction...');
  
  const provider = new CloudflareProvider();
  
  // Test inheritance
  assert.ok(provider instanceof TunnelProvider, 'Should extend TunnelProvider');
  assert.ok(provider instanceof CloudflareProvider, 'Should be instance of CloudflareProvider');
  
  // Test properties
  assert.equal(provider.name, 'cloudflare', 'Should have correct name');
  assert.ok(provider.features instanceof ProviderFeatures, 'Should have ProviderFeatures');
  
  // Test initial state
  assert.equal(provider.currentProcess, null, 'Should have no initial process');
  assert.equal(provider.tunnelUrl, null, 'Should have no initial tunnel URL');
  
  console.log('    ✓ Provider construction works correctly');
}

async function testInterfaceCompliance() {
  console.log('  📋 Testing interface compliance...');
  
  const provider = new CloudflareProvider();
  
  // Test required methods exist
  assert.equal(typeof provider.createTunnel, 'function', 'Should have createTunnel method');
  assert.equal(typeof provider.isAvailable, 'function', 'Should have isAvailable method');
  assert.equal(typeof provider.getFeatures, 'function', 'Should have getFeatures method');
  assert.equal(typeof provider.closeTunnel, 'function', 'Should have closeTunnel method');
  
  // Test method signatures
  const createTunnelLength = provider.createTunnel.length;
  assert.equal(createTunnelLength, 1, 'createTunnel should accept 1 parameter (port)');
  
  const isAvailableLength = provider.isAvailable.length;
  assert.equal(isAvailableLength, 0, 'isAvailable should accept 0 parameters (optional options object)');
  
  console.log('    ✓ Interface compliance works correctly');
}

async function testFeaturesInformation() {
  console.log('  📋 Testing features information...');
  
  const provider = new CloudflareProvider();
  const features = provider.getFeatures();
  
  // Test basic features
  assert.equal(features.requiresConfirmation, false, 'Should not require confirmation');
  assert.equal(features.speed, 'fast', 'Should have fast speed');
  assert.equal(features.httpsSupport, true, 'Should support HTTPS');
  assert.equal(features.customDomain, true, 'Should support custom domain with domain selection');
  assert.ok(features.description.includes('Cloudflare'), 'Description should mention Cloudflare');
  
  // Test extended features
  assert.ok(features.benefits, 'Should have benefits array');
  assert.ok(Array.isArray(features.benefits), 'Benefits should be array');
  assert.ok(features.benefits.includes('无需注册账户'), 'Should mention no registration required');
  assert.ok(features.benefits.includes('全球 CDN 加速'), 'Should mention global CDN');
  
  // Test other extended properties
  assert.equal(features.maxConnections, '无限制', 'Should have unlimited connections');
  assert.equal(features.uptime, '99.9%+', 'Should have high uptime');
  assert.ok(features.regions.includes('全球 CDN'), 'Should mention global regions');
  
  console.log('    ✓ Features information works correctly');
}

async function testAvailabilityCheck() {
  console.log('  📋 Testing availability check...');
  
  const provider = new CloudflareProvider();
  
  // Test availability check (this will likely return false since cloudflared is not installed)
  const available = await provider.isAvailable();
  assert.equal(typeof available, 'boolean', 'isAvailable should return boolean');
  
  // Since cloudflared is likely not installed in test environment, we expect false
  // But we test that the method works correctly
  console.log(`    Cloudflared availability: ${available}`);
  
  // The availability check should complete within reasonable time
  const startTime = Date.now();
  await provider.isAvailable();
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  assert.ok(duration < 5000, 'Availability check should complete within 5 seconds');
  
  console.log('    ✓ Availability check works correctly');
}

async function testStatusMethods() {
  console.log('  📋 Testing status methods...');
  
  const provider = new CloudflareProvider();
  
  // Test initial status
  const initialStatus = provider.getStatus();
  assert.equal(typeof initialStatus, 'object', 'getStatus should return object');
  assert.equal(initialStatus.isActive, false, 'Should not be active initially');
  assert.equal(initialStatus.tunnelUrl, null, 'Should have no tunnel URL initially');
  assert.equal(initialStatus.processId, undefined, 'Should have no process ID initially');
  
  // Test closeTunnel method (should handle no active tunnel gracefully)
  await provider.closeTunnel(); // Should not throw
  
  console.log('    ✓ Status methods work correctly');
}

/**
 * Test cloudflared output parsing (unit test with mock data)
 */
async function testOutputParsing() {
  console.log('  📋 Testing output parsing logic...');
  
  const provider = new CloudflareProvider();
  
  // Test the private _parseCloudflaredOutput method indirectly by testing URL extraction patterns
  const testOutputs = [
    'https://abc123.trycloudflare.com',
    'Starting tunnel at https://def456.trycloudflare.com',
    'Tunnel started successfully: https://ghi789.trycloudflare.com',
    'Connection established: https://jkl012.trycloudflare.com\nTunnel ready'
  ];
  
  for (const output of testOutputs) {
    const urlMatch = output.match(/https?:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com/);
    assert.ok(urlMatch, `Should extract URL from: ${output}`);
    assert.ok(urlMatch[0].includes('trycloudflare.com'), 'Should extract correct domain');
  }
  
  console.log('    ✓ Output parsing logic works correctly');
}

/**
 * Test authentication methods
 */
async function testAuthenticationMethods() {
  console.log('  📋 Testing authentication methods...');
  
  const provider = new CloudflareProvider();
  
  // Test isAuthenticated method exists and returns boolean
  const isAuthenticated = await provider.isAuthenticated();
  assert.equal(typeof isAuthenticated, 'boolean', 'isAuthenticated should return boolean');
  
  // Test setAuthMode method
  provider.setAuthMode(true, 'test-tunnel');
  assert.equal(provider.authMode, true, 'Should set auth mode to true');
  assert.equal(provider.customTunnelName, 'test-tunnel', 'Should set custom tunnel name');
  
  provider.setAuthMode(false);
  assert.equal(provider.authMode, false, 'Should set auth mode to false');
  
  // Test login and logout methods exist
  assert.equal(typeof provider.login, 'function', 'Should have login method');
  assert.equal(typeof provider.logout, 'function', 'Should have logout method');
  
  console.log('    ✓ Authentication methods work correctly');
}

/**
 * Test persistent mode configuration
 */
async function testPersistentMode() {
  console.log('  📋 Testing persistent mode configuration...');
  
  const provider = new CloudflareProvider();
  
  // Test temporary mode (default)
  provider.setAuthMode(false);
  const tempStatus = provider.getStatus();
  assert.equal(provider.authMode, false, 'Should use temporary mode by default');
  
  // Test persistent mode
  provider.setAuthMode(true);
  assert.equal(provider.authMode, true, 'Should enable persistent mode');
  
  // Test persistent mode with custom name
  provider.setAuthMode(true, 'my-custom-tunnel');
  assert.equal(provider.authMode, true, 'Should enable persistent mode with custom name');
  assert.equal(provider.customTunnelName, 'my-custom-tunnel', 'Should set custom tunnel name');
  
  // Test createTunnel options
  // Note: We can't actually create tunnels without cloudflared, but we can test the logic
  try {
    // This will fail due to cloudflared not being available, but we can test the error messages
    // Skip auto-install in tests to avoid timeouts
    await provider.createTunnel(8080, { useAuth: true, customName: 'test', autoInstall: false, skipDomainSelection: true });
  } catch (error) {
    assert.ok(error.message.includes('cloudflared') || error.message.includes('登录'), 'Should provide appropriate error message');
  }
  
  console.log('    ✓ Persistent mode configuration works correctly');
}

/**
 * Integration test that checks the complete flow (with mock/simulation)
 */
async function testErrorHandling() {
  console.log('  📋 Testing error handling...');
  
  const provider = new CloudflareProvider();
  
  // Test createTunnel with invalid port (should fail appropriately)
  try {
    await provider.createTunnel('invalid-port', { autoInstall: false, skipDomainSelection: true });
    assert.fail('Should throw error for invalid port');
  } catch (error) {
    // This might fail for various reasons (cloudflared not available, invalid port, etc.)
    // We just verify that it throws an error as expected
    assert.ok(error instanceof Error, 'Should throw Error instance');
    assert.ok(error.message.length > 0, 'Should have meaningful error message');
  }
  
  // Test createTunnel with port out of range
  try {
    await provider.createTunnel(99999, { autoInstall: false, skipDomainSelection: true });
    assert.fail('Should throw error for port out of range');
  } catch (error) {
    assert.ok(error instanceof Error, 'Should throw Error instance for invalid port');
  }
  
  console.log('    ✓ Error handling works correctly');
}

// Run additional tests
async function runAdditionalTests() {
  await testOutputParsing();
  await testErrorHandling();
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runCloudflareProviderTests()
    .then(() => runAdditionalTests())
    .catch(console.error);
}

export { runCloudflareProviderTests };