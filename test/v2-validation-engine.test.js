import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ValidationEngine } from '../src/v2/validation-engine.js';

describe('V2 ValidationEngine测试', () => {
  let validationEngine;
  
  beforeEach(() => {
    validationEngine = new ValidationEngine();
  });

  test('应该正确检查系统兼容性', async () => {
    const compatible = await validationEngine.checkSystemCompatibility();
    
    // 当前系统应该是兼容的（linux/darwin/win32之一）
    assert.ok(typeof compatible === 'boolean');
    
    // 在CI环境中，通常是linux，应该兼容
    if (process.platform === 'linux' || process.platform === 'darwin' || process.platform === 'win32') {
      assert.ok(compatible);
    }
  });

  test('应该检查cloudflared安装状态', async () => {
    const result = await validationEngine.checkCloudflaredInstallation();
    
    assert.ok(typeof result.installed === 'boolean');
    assert.ok(typeof result.needsUpdate === 'boolean');
    
    if (result.installed) {
      assert.ok(typeof result.version === 'string');
    } else {
      assert.strictEqual(result.version, null);
    }
  });

  test('应该检查网络连接性', async () => {
    const connected = await validationEngine.checkNetworkConnectivity();
    
    assert.ok(typeof connected === 'boolean');
    
    // 注意：这个测试可能因为网络环境而失败
    // 在CI环境中可能需要跳过或模拟
  });

  test('应该执行完整的预检流程', async () => {
    const results = await validationEngine.runPreflightChecks();
    
    // 验证返回结果的结构
    assert.ok(typeof results.cloudflaredInstalled === 'boolean');
    assert.ok(typeof results.systemCompatible === 'boolean');
    assert.ok(typeof results.networkConnectivity === 'boolean');
    assert.ok(typeof results.passed === 'boolean');
    assert.ok(Array.isArray(results.recommendedActions));
    assert.ok(typeof results.summary === 'string');
  });

  test('应该正确判断版本更新需求', () => {
    // 测试正常版本
    assert.strictEqual(validationEngine.shouldUpdateVersion('2024.1.0'), false);
    assert.strictEqual(validationEngine.shouldUpdateVersion('2025.1.0'), false);
    
    // 测试旧版本
    assert.strictEqual(validationEngine.shouldUpdateVersion('2023.1.0'), true);
    assert.strictEqual(validationEngine.shouldUpdateVersion('2022.1.0'), true);
    
    // 测试无效版本
    assert.strictEqual(validationEngine.shouldUpdateVersion('unknown'), true);
    assert.strictEqual(validationEngine.shouldUpdateVersion(null), true);
    assert.strictEqual(validationEngine.shouldUpdateVersion(''), true);
  });

  test('应该生成有意义的预检摘要', () => {
    const mockResults = {
      cloudflaredInstalled: true,
      cloudflaredVersion: '2024.1.0',
      systemCompatible: true,
      networkConnectivity: true,
      recommendedActions: []
    };
    
    const summary = validationEngine.generatePreflightSummary(mockResults);
    
    assert.ok(summary.includes('V2环境预检结果'));
    assert.ok(summary.includes('✅ cloudflared已安装'));
    assert.ok(summary.includes('✅ 系统兼容性检查通过'));
    assert.ok(summary.includes('✅ Cloudflare网络连接正常'));
  });

  test('预检失败时应该包含推荐操作', () => {
    const mockResults = {
      cloudflaredInstalled: false,
      cloudflaredVersion: null,
      systemCompatible: true,
      networkConnectivity: false,
      recommendedActions: [
        '需要安装cloudflared命令行工具',
        '无法连接到Cloudflare服务，请检查网络连接'
      ]
    };
    
    const summary = validationEngine.generatePreflightSummary(mockResults);
    
    assert.ok(summary.includes('❌ cloudflared未安装'));
    assert.ok(summary.includes('❌ 无法连接到Cloudflare服务'));
    assert.ok(summary.includes('📋 推荐操作:'));
    assert.ok(summary.includes('1. 需要安装cloudflared命令行工具'));
    assert.ok(summary.includes('2. 无法连接到Cloudflare服务，请检查网络连接'));
  });

  test('sleep函数应该正确等待', async () => {
    const startTime = Date.now();
    await validationEngine.sleep(100);
    const endTime = Date.now();
    
    const elapsed = endTime - startTime;
    
    // 允许一定的时间误差（±20ms）
    assert.ok(elapsed >= 80 && elapsed <= 120);
  });

  // DNS验证测试被跳过以避免网络超时
  // test('DNS验证应该处理查询失败情况', async () => {
  //   // 测试无效域名，应该返回false
  //   const result = await validationEngine.verifyDnsResolution(
  //     'definitely-non-existent-domain-12345.com',
  //     'test.example.com'
  //   );
  //   
  //   assert.strictEqual(result, false);
  // });
});