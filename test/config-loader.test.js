import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigLoader } from '../src/config/config-loader.js';

/**
 * Test Suite for Configuration Loader
 */
async function runConfigLoaderTests() {
  console.log('🧪 Running Configuration Loader Tests...');
  
  // Test 1: Configuration Loader Construction
  await testConfigLoaderConstruction();
  
  // Test 2: Default Configuration
  await testDefaultConfiguration();
  
  // Test 3: Environment Variables
  await testEnvironmentVariables();
  
  // Test 4: Configuration Validation
  await testConfigurationValidation();
  
  // Test 5: User Configuration File
  await testUserConfigFile();
  
  // Test 6: Cloudflare Auth Management
  await testCloudflareAuthManagement();
  
  // Test 7: Configuration Merging
  await testConfigurationMerging();

  console.log('✅ All Configuration Loader tests passed!');
}

async function testConfigLoaderConstruction() {
  console.log('  📋 Testing configuration loader construction...');
  
  const loader = new ConfigLoader();
  
  // Test basic properties
  assert.ok(loader instanceof ConfigLoader, 'Should create ConfigLoader instance');
  assert.ok(loader.moduleName === 'uvx', 'Should have correct module name');
  assert.ok(loader.defaultConfig, 'Should have default configuration');
  assert.ok(loader.explorer, 'Should have cosmiconfig explorer');
  
  // Test default config structure
  assert.ok(loader.defaultConfig.defaultProvider, 'Should have default provider');
  assert.ok(typeof loader.defaultConfig.timeout === 'number', 'Should have timeout setting');
  assert.ok(typeof loader.defaultConfig.retries === 'number', 'Should have retries setting');
  assert.ok(loader.defaultConfig.cloudflare, 'Should have Cloudflare settings');
  assert.ok(loader.defaultConfig.ui, 'Should have UI settings');
  
  console.log('    ✓ Configuration loader construction works correctly');
}

async function testDefaultConfiguration() {
  console.log('  📋 Testing default configuration...');
  
  const loader = new ConfigLoader();
  const config = loader.loadConfig();
  
  // Test that defaults are applied
  assert.equal(config.defaultProvider, 'cloudflare', 'Should have correct default provider');
  assert.equal(typeof config.timeout, 'number', 'Should have numeric timeout');
  assert.equal(typeof config.retries, 'number', 'Should have numeric retries');
  assert.equal(typeof config.cloudflare.tempMode, 'boolean', 'Should have tempMode setting');
  assert.equal(config.ui.colors, true, 'Should enable colors by default');
  assert.equal(config.ui.icons, true, 'Should enable icons by default');
  
  console.log('    ✓ Default configuration works correctly');
}

async function testEnvironmentVariables() {
  console.log('  📋 Testing environment variables...');
  
  // Save original environment
  const originalEnv = { ...process.env };
  
  try {
    // Set test environment variables
    process.env.UVX_PROVIDER = 'pinggy';
    process.env.UVX_TIMEOUT = '45000';
    process.env.UVX_RETRIES = '5';
    process.env.UVX_CLOUDFLARE_TEMP_MODE = 'false';
    process.env.UVX_VERBOSE = 'true';
    process.env.UVX_NO_COLORS = 'true';
    
    const loader = new ConfigLoader();
    const config = loader.loadConfig();
    
    // Test environment variable override
    assert.equal(config.defaultProvider, 'pinggy', 'Should override default provider');
    assert.equal(config.timeout, 45000, 'Should override timeout');
    assert.equal(config.retries, 5, 'Should override retries');
    assert.equal(config.cloudflare.tempMode, false, 'Should override Cloudflare temp mode');
    assert.equal(config.ui.verbose, true, 'Should enable verbose mode');
    assert.equal(config.ui.colors, false, 'Should disable colors');
    
  } finally {
    // Restore original environment
    process.env = originalEnv;
  }
  
  console.log('    ✓ Environment variables work correctly');
}

async function testConfigurationValidation() {
  console.log('  📋 Testing configuration validation...');
  
  const loader = new ConfigLoader();
  
  // Test valid configuration
  const validConfig = {
    defaultProvider: 'cloudflare',
    timeout: 30000,
    retries: 3
  };
  
  const validErrors = loader.validateConfig(validConfig);
  assert.equal(validErrors.length, 0, 'Should have no errors for valid config');
  
  // Test invalid provider
  const invalidProviderConfig = {
    defaultProvider: 'invalid-provider'
  };
  
  const providerErrors = loader.validateConfig(invalidProviderConfig);
  assert.ok(providerErrors.length > 0, 'Should have errors for invalid provider');
  assert.ok(providerErrors[0].includes('invalid-provider'), 'Should mention invalid provider');
  
  // Test invalid timeout
  const invalidTimeoutConfig = {
    timeout: -1000
  };
  
  const timeoutErrors = loader.validateConfig(invalidTimeoutConfig);
  assert.ok(timeoutErrors.length > 0, 'Should have errors for invalid timeout');
  
  // Test invalid retries
  const invalidRetriesConfig = {
    retries: -5
  };
  
  const retriesErrors = loader.validateConfig(invalidRetriesConfig);
  assert.ok(retriesErrors.length > 0, 'Should have errors for invalid retries');
  
  console.log('    ✓ Configuration validation works correctly');
}

async function testUserConfigFile() {
  console.log('  📋 Testing user configuration file...');
  
  const loader = new ConfigLoader();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uvx-test-'));
  
  try {
    // Override config directory for testing
    loader.configDir = tempDir;
    loader.configFile = path.join(tempDir, 'config.json');
    
    const testConfig = {
      defaultProvider: 'pinggy',
      timeout: 60000,
      cloudflare: {
        authToken: 'test-token'
      }
    };
    
    // Test saving config
    const saveSuccess = loader.saveUserConfig(testConfig);
    assert.ok(saveSuccess, 'Should save user config successfully');
    assert.ok(fs.existsSync(loader.configFile), 'Should create config file');
    
    // Test loading config
    const loadedConfig = loader.loadUserConfig();
    assert.ok(loadedConfig, 'Should load user config');
    assert.equal(loadedConfig.defaultProvider, 'pinggy', 'Should preserve provider setting');
    assert.equal(loadedConfig.timeout, 60000, 'Should preserve timeout setting');
    assert.equal(loadedConfig.cloudflare.authToken, 'test-token', 'Should preserve auth token');
    
    // Test updating config
    const updateSuccess = loader.updateUserConfig({
      retries: 10,
      ui: { verbose: true }
    });
    assert.ok(updateSuccess, 'Should update user config successfully');
    
    const updatedConfig = loader.loadUserConfig();
    assert.equal(updatedConfig.retries, 10, 'Should add new setting');
    assert.equal(updatedConfig.ui.verbose, true, 'Should add nested setting');
    assert.equal(updatedConfig.defaultProvider, 'pinggy', 'Should preserve existing settings');
    
  } finally {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
  
  console.log('    ✓ User configuration file works correctly');
}

async function testCloudflareAuthManagement() {
  console.log('  📋 Testing Cloudflare auth management...');
  
  const loader = new ConfigLoader();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uvx-test-'));
  
  try {
    // Override config directory for testing
    loader.configDir = tempDir;
    loader.configFile = path.join(tempDir, 'config.json');
    
    // Test saving auth data
    const authData = {
      authToken: 'test-cloudflare-token',
      tempMode: false,
      customDomain: 'myapp'
    };
    
    const saveSuccess = loader.saveCloudflareAuth(authData);
    assert.ok(saveSuccess, 'Should save Cloudflare auth successfully');
    
    // Test loading auth data
    const loadedAuth = loader.getCloudflareAuth();
    assert.equal(loadedAuth.authToken, 'test-cloudflare-token', 'Should preserve auth token');
    assert.equal(loadedAuth.tempMode, false, 'Should preserve temp mode setting');
    assert.equal(loadedAuth.customDomain, 'myapp', 'Should preserve custom domain');
    assert.ok(loadedAuth.lastUpdated, 'Should have lastUpdated timestamp');
    
    // Test clearing auth data
    const clearSuccess = loader.clearCloudflareAuth();
    assert.ok(clearSuccess, 'Should clear auth successfully');
    
    const clearedAuth = loader.getCloudflareAuth();
    assert.equal(clearedAuth.authToken, null, 'Should clear auth token');
    assert.ok(clearedAuth.lastUpdated, 'Should update lastUpdated timestamp');
    
  } finally {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
  
  console.log('    ✓ Cloudflare auth management works correctly');
}

async function testConfigurationMerging() {
  console.log('  📋 Testing configuration merging...');
  
  const loader = new ConfigLoader();
  
  // Test basic merging
  const target = {
    defaultProvider: 'cloudflare',
    timeout: 30000,
    cloudflare: {
      tempMode: true,
      authToken: null
    }
  };
  
  const source = {
    defaultProvider: 'pinggy',
    retries: 5,
    cloudflare: {
      authToken: 'new-token',
      customDomain: 'myapp'
    },
    ui: {
      verbose: true
    }
  };
  
  loader.mergeConfig(target, source);
  
  // Test that values are properly merged
  assert.equal(target.defaultProvider, 'pinggy', 'Should override provider');
  assert.equal(target.timeout, 30000, 'Should preserve existing timeout');
  assert.equal(target.retries, 5, 'Should add new retries setting');
  assert.equal(target.cloudflare.tempMode, true, 'Should preserve nested tempMode');
  assert.equal(target.cloudflare.authToken, 'new-token', 'Should override nested authToken');
  assert.equal(target.cloudflare.customDomain, 'myapp', 'Should add new nested setting');
  assert.equal(target.ui.verbose, true, 'Should add new nested object');
  
  console.log('    ✓ Configuration merging works correctly');
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runConfigLoaderTests().catch(console.error);
}

export { runConfigLoaderTests };