import { strict as assert } from 'assert';
import { OutputFormatter, formatter } from '../src/utils/output-formatter.js';
import { ProviderFeatures, TunnelResult } from '../src/providers/index.js';

/**
 * Test Suite for Output Formatter
 */
async function runOutputFormatterTests() {
  console.log('🧪 Running Output Formatter Tests...');
  
  // Test 1: Formatter Construction
  await testFormatterConstruction();
  
  // Test 2: Color Functions
  await testColorFunctions();
  
  // Test 3: Basic Message Formatting
  await testBasicMessageFormatting();
  
  // Test 4: Tunnel Success Output
  await testTunnelSuccessOutput();
  
  // Test 5: Provider List Output
  await testProviderListOutput();
  
  // Test 6: Error and Warning Formatting
  await testErrorWarningFormatting();

  console.log('✅ All Output Formatter tests passed!');
}

async function testFormatterConstruction() {
  console.log('  📋 Testing formatter construction...');
  
  // Test singleton instance
  assert.ok(formatter instanceof OutputFormatter, 'formatter should be OutputFormatter instance');
  
  // Test new instance
  const newFormatter = new OutputFormatter();
  assert.ok(newFormatter instanceof OutputFormatter, 'Should create new OutputFormatter instance');
  
  // Test colors and icons exist
  assert.ok(newFormatter.colors, 'Should have colors object');
  assert.ok(newFormatter.icons, 'Should have icons object');
  assert.ok(typeof newFormatter.colors.success === 'function', 'Colors should be functions');
  assert.ok(typeof newFormatter.icons.success === 'string', 'Icons should be strings');
  
  console.log('    ✓ Formatter construction works correctly');
}

async function testColorFunctions() {
  console.log('  📋 Testing color functions...');
  
  // Test speed color mapping
  const fastColor = formatter.getSpeedColor('fast');
  const mediumColor = formatter.getSpeedColor('medium');
  const slowColor = formatter.getSpeedColor('slow');
  const unknownColor = formatter.getSpeedColor('unknown');
  
  assert.ok(typeof fastColor === 'function', 'Should return color function for fast');
  assert.ok(typeof mediumColor === 'function', 'Should return color function for medium');
  assert.ok(typeof slowColor === 'function', 'Should return color function for slow');
  assert.ok(typeof unknownColor === 'function', 'Should return color function for unknown');
  
  // Test that they return different functions (different colors)
  assert.notEqual(fastColor, mediumColor, 'Fast and medium should have different colors');
  assert.notEqual(mediumColor, slowColor, 'Medium and slow should have different colors');
  
  console.log('    ✓ Color functions work correctly');
}

async function testBasicMessageFormatting() {
  console.log('  📋 Testing basic message formatting...');
  
  // Test info message
  const infoMessage = formatter.formatInfo('Test info message');
  assert.ok(typeof infoMessage === 'string', 'Should return string');
  assert.ok(infoMessage.includes('Test info message'), 'Should contain the message');
  assert.ok(infoMessage.includes('ℹ️'), 'Should contain info icon');
  
  // Test warning message
  const warningMessage = formatter.formatWarning('Test warning');
  assert.ok(warningMessage.includes('Test warning'), 'Should contain warning message');
  assert.ok(warningMessage.includes('⚠️'), 'Should contain warning icon');
  
  // Test progress message
  const progressMessage = formatter.formatProgress('Loading...');
  assert.ok(progressMessage.includes('Loading...'), 'Should contain progress message');
  assert.ok(progressMessage.includes('🔄'), 'Should contain loading icon');
  
  // Test auth messages
  const loginMessage = formatter.formatAuthMessage('login', 'Login successful');
  assert.ok(loginMessage.includes('Login successful'), 'Should contain login message');
  assert.ok(loginMessage.includes('🔐'), 'Should contain auth icon');
  
  const logoutMessage = formatter.formatAuthMessage('logout', 'Logout successful');
  assert.ok(logoutMessage.includes('Logout successful'), 'Should contain logout message');
  assert.ok(logoutMessage.includes('🚪'), 'Should contain logout icon');
  
  console.log('    ✓ Basic message formatting works correctly');
}

async function testTunnelSuccessOutput() {
  console.log('  📋 Testing tunnel success output...');
  
  // Create test data
  const features = new ProviderFeatures({
    requiresConfirmation: false,
    speed: 'fast',
    httpsSupport: true,
    description: 'Test provider description',
    benefits: ['No registration', 'Fast speed', 'Global CDN']
  });
  
  const result = new TunnelResult('https://test.example.com', 'test-provider', features);
  
  const mockProvider = {
    authMode: false,
    customTunnelName: null
  };
  
  const output = formatter.formatTunnelSuccess(result, mockProvider, features);
  
  // Test output contains expected elements
  assert.ok(typeof output === 'string', 'Should return string');
  assert.ok(output.includes('隧道创建成功'), 'Should contain success message');
  assert.ok(output.includes('https://test.example.com'), 'Should contain URL');
  assert.ok(output.includes('test-provider'), 'Should contain provider name');
  assert.ok(output.includes('fast'), 'Should contain speed info');
  assert.ok(output.includes('支持'), 'Should contain HTTPS support info');
  assert.ok(output.includes('无确认页面'), 'Should contain no confirmation info');
  assert.ok(output.includes('Test provider description'), 'Should contain description');
  assert.ok(output.includes('Ctrl+C'), 'Should contain exit instruction');
  
  // Test with confirmation required
  const confirmFeatures = new ProviderFeatures({
    requiresConfirmation: true,
    speed: 'medium',
    httpsSupport: false
  });
  
  const confirmOutput = formatter.formatTunnelSuccess(result, mockProvider, confirmFeatures);
  assert.ok(confirmOutput.includes('点击确认'), 'Should contain confirmation info');
  assert.ok(confirmOutput.includes('不支持'), 'Should contain HTTPS not supported');
  
  console.log('    ✓ Tunnel success output works correctly');
}

async function testProviderListOutput() {
  console.log('  📋 Testing provider list output...');
  
  const providersInfo = [
    {
      name: 'cloudflare',
      isDefault: true,
      features: new ProviderFeatures({
        requiresConfirmation: false,
        speed: 'fast',
        httpsSupport: true,
        description: 'Cloudflare tunnel service'
      })
    },
    {
      name: 'localtunnel',
      isDefault: false,
      features: new ProviderFeatures({
        requiresConfirmation: true,
        speed: 'medium',
        httpsSupport: true,
        description: 'Classic tunnel service'
      })
    }
  ];
  
  const output = formatter.formatProvidersList(providersInfo);
  
  assert.ok(typeof output === 'string', 'Should return string');
  assert.ok(output.includes('可用的隧道提供商'), 'Should contain providers header');
  assert.ok(output.includes('cloudflare'), 'Should contain cloudflare provider');
  assert.ok(output.includes('localtunnel'), 'Should contain localtunnel provider');
  assert.ok(output.includes('⭐'), 'Should contain default provider star');
  assert.ok(output.includes('fast'), 'Should contain speed information');
  assert.ok(output.includes('medium'), 'Should contain speed information');
  assert.ok(output.includes('无需确认'), 'Should contain no confirmation info');
  assert.ok(output.includes('需要点击确认'), 'Should contain confirmation required info');
  
  console.log('    ✓ Provider list output works correctly');
}

async function testErrorWarningFormatting() {
  console.log('  📋 Testing error and warning formatting...');
  
  // Test error without suggestions
  const simpleError = formatter.formatError('Simple error message');
  assert.ok(simpleError.includes('Simple error message'), 'Should contain error message');
  assert.ok(simpleError.includes('❌'), 'Should contain error icon');
  
  // Test error with suggestions
  const errorWithSuggestions = formatter.formatError('Complex error', [
    'Try solution 1',
    'Try solution 2',
    'Contact support'
  ]);
  assert.ok(errorWithSuggestions.includes('Complex error'), 'Should contain error message');
  assert.ok(errorWithSuggestions.includes('故障排除建议'), 'Should contain suggestions header');
  assert.ok(errorWithSuggestions.includes('Try solution 1'), 'Should contain first suggestion');
  assert.ok(errorWithSuggestions.includes('Try solution 2'), 'Should contain second suggestion');
  assert.ok(errorWithSuggestions.includes('Contact support'), 'Should contain third suggestion');
  assert.ok(errorWithSuggestions.includes('1.'), 'Should contain numbered list');
  
  // Test utility functions
  const separator = formatter.createSeparator();
  assert.ok(typeof separator === 'string', 'Should return string separator');
  assert.equal(separator.length, 60, 'Should have default length of 60');
  
  const customSeparator = formatter.createSeparator('-', 30);
  assert.equal(customSeparator.length, 30, 'Should respect custom length');
  
  const title = formatter.formatTitle('Test Title');
  assert.ok(title.includes('Test Title'), 'Should contain title text');
  
  // Test tunnel closing messages
  const closingMessage = formatter.formatTunnelClosing();
  assert.ok(closingMessage.includes('正在关闭'), 'Should contain closing message');
  
  const closedMessage = formatter.formatTunnelClosed();
  assert.ok(closedMessage.includes('安全关闭'), 'Should contain closed message');
  
  console.log('    ✓ Error and warning formatting works correctly');
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runOutputFormatterTests().catch(console.error);
}

export { runOutputFormatterTests };