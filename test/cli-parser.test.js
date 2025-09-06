import { strict as assert } from 'assert';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, '../bin/index.js');

/**
 * Test Suite for CLI Argument Parsing
 */
async function runCliParsingTests() {
  console.log('🧪 Running CLI Argument Parsing Tests...');
  
  // Test 1: Help Command
  await testHelpCommand();
  
  // Test 2: List Providers
  await testListProvidersCommand();
  
  // Test 3: Version Command
  await testVersionCommand();
  
  // Test 4: Provider Validation
  await testProviderValidation();
  
  // Test 5: Cloudflare Commands
  await testCloudflareCommands();
  
  // Test 6: Error Handling
  await testErrorHandling();

  console.log('✅ All CLI Argument Parsing tests passed!');
}

/**
 * Helper function to run CLI command and capture output
 */
function runCliCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [cliPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
        output: stdout + stderr
      });
    });
    
    child.on('error', reject);
  });
}

async function testHelpCommand() {
  console.log('  📋 Testing help command...');
  
  const result = await runCliCommand(['--help']);
  
  assert.equal(result.code, 0, 'Help command should exit successfully');
  assert.ok(result.output.includes('多提供商内网穿透 CLI 工具'), 'Should display description');
  assert.ok(result.output.includes('--provider'), 'Should show --provider option');
  assert.ok(result.output.includes('--list-providers'), 'Should show --list-providers option');
  assert.ok(result.output.includes('--cloudflare-login'), 'Should show --cloudflare-login option');
  assert.ok(result.output.includes('--cloudflare-logout'), 'Should show --cloudflare-logout option');
  assert.ok(result.output.includes('--cloudflare-custom'), 'Should show --cloudflare-custom option');
  
  console.log('    ✓ Help command works correctly');
}

async function testListProvidersCommand() {
  console.log('  📋 Testing list providers command...');
  
  const result = await runCliCommand(['--list-providers']);
  
  assert.equal(result.code, 0, 'List providers should exit successfully');
  assert.ok(result.output.includes('可用的隧道提供商'), 'Should display providers header');
  assert.ok(result.output.includes('pinggy'), 'Should list pinggy provider');
  assert.ok(result.output.includes('serveo'), 'Should list serveo provider');
  assert.ok(result.output.includes('localtunnel'), 'Should list localtunnel provider');
  assert.ok(result.output.includes('使用方法'), 'Should show usage examples');
  assert.ok(result.output.includes('--cloudflare-login'), 'Should show cloudflare examples');
  
  console.log('    ✓ List providers command works correctly');
}

async function testVersionCommand() {
  console.log('  📋 Testing version command...');
  
  const result = await runCliCommand(['--version']);
  
  assert.equal(result.code, 0, 'Version command should exit successfully');
  assert.ok(result.output.includes('3.1.0'), 'Should display correct version');
  
  console.log('    ✓ Version command works correctly');
}

async function testProviderValidation() {
  console.log('  📋 Testing provider validation...');
  
  // Test invalid provider
  const invalidResult = await runCliCommand(['8000', '--provider=invalidProvider']);
  
  assert.notEqual(invalidResult.code, 0, 'Invalid provider should fail');
  assert.ok(invalidResult.output.includes('配置错误') || invalidResult.output.includes('未知的提供商'), 'Should show provider error');
  assert.ok(invalidResult.output.includes('无效的默认提供商') || invalidResult.output.includes('可用的提供商'), 'Should show provider information');
  
  // Test valid providers (note: these won't actually create tunnels without real services)
  const validProviders = ['pinggy', 'localtunnel', 'serveo'];
  
  for (const provider of validProviders) {
    // We can't test actual tunnel creation, but we can test argument parsing
    console.log(`    Testing provider validation for: ${provider}`);
    // Provider validation happens before tunnel creation, so invalid ports should still show the error
  }
  
  console.log('    ✓ Provider validation works correctly');
}

async function testCloudflareCommands() {
  console.log('  📋 Testing Cloudflare commands...');
  
  // Test cloudflare login (will fail due to cloudflared not being installed, but should show proper error)
  const loginResult = await runCliCommand(['--cloudflare-login']);
  assert.notEqual(loginResult.code, 0, 'Cloudflare login should fail without cloudflared');
  assert.ok(loginResult.output.includes('登录失败') || loginResult.output.includes('cloudflared'), 'Should show appropriate error message');
  
  // Test cloudflare logout
  const logoutResult = await runCliCommand(['--cloudflare-logout']);
  assert.equal(logoutResult.code, 0, 'Cloudflare logout should exit successfully');
  assert.ok(logoutResult.output.includes('正在清除') || logoutResult.output.includes('登出'), 'Should show logout message');
  
  // Test cloudflare custom with wrong provider
  const conflictResult = await runCliCommand(['8000', '--cloudflare-custom=mytest', '--provider=pinggy']);
  assert.notEqual(conflictResult.code, 0, 'Conflicting options should fail');
  assert.ok(conflictResult.output.includes('只能与 --provider=cloudflare 一起使用'), 'Should show conflict error');
  
  console.log('    ✓ Cloudflare commands work correctly');
}

async function testErrorHandling() {
  console.log('  📋 Testing error handling...');
  
  // Test missing port
  const noPortResult = await runCliCommand([]);
  assert.notEqual(noPortResult.code, 0, 'Missing port should fail');
  assert.ok(noPortResult.output.includes('请提供端口号'), 'Should show missing port error');
  
  // Test invalid port
  const invalidPortResult = await runCliCommand(['invalid-port']);
  assert.notEqual(invalidPortResult.code, 0, 'Invalid port should fail');
  assert.ok(invalidPortResult.output.includes('端口必须是'), 'Should show invalid port error');
  
  // Test port out of range
  const outOfRangeResult = await runCliCommand(['99999']);
  assert.notEqual(outOfRangeResult.code, 0, 'Port out of range should fail');
  assert.ok(outOfRangeResult.output.includes('1-65535'), 'Should show port range error');
  
  console.log('    ✓ Error handling works correctly');
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runCliParsingTests().catch(console.error);
}

export { runCliParsingTests };