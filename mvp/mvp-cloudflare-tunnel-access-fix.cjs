#!/usr/bin/env node

/**
 * MVP文件：验证Cloudflare隧道访问修复方案
 * 基于研究结果实现最佳实践
 * 
 * 主要改进：
 * 1. 增强的DNS验证逻辑（多DNS服务器验证）
 * 2. 严格的隧道启动确认（多连接验证）
 * 3. 端到端连通性测试
 * 4. DNS传播验证
 */

const { spawn } = require('child_process');
const { promises: dns } = require('dns');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 配置参数
const TUNNEL_ID = '392a61b1-88c5-4765-b749-b0f271ad8914';
const DOMAIN = 'gemini.yxhpy.xyz';
const LOCAL_PORT = 8000;
const EXPECTED_CNAME = `${TUNNEL_ID}.cfargotunnel.com`;

console.log('🚀 MVP: Cloudflare隧道访问修复方案验证');
console.log(`隧道ID: ${TUNNEL_ID}`);
console.log(`域名: ${DOMAIN}`);
console.log(`本地端口: ${LOCAL_PORT}`);
console.log('');

// 工具函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 1. 增强的DNS验证（多DNS服务器）
async function verifyDnsRecordEnhanced(domain, expectedTarget) {
  console.log('=== 增强DNS验证 ===');
  
  const dnsServers = [
    { name: 'Cloudflare', server: '1.1.1.1' },
    { name: 'Google', server: '8.8.8.8' },
    { name: '系统默认', server: null }
  ];
  
  let successCount = 0;
  
  for (const { name, server } of dnsServers) {
    try {
      console.log(`🔍 检查${name}DNS服务器...`);
      
      let result;
      if (server) {
        const resolver = new dns.Resolver();
        resolver.setServers([server]);
        const cnameRecords = await resolver.resolveCname(domain);
        result = cnameRecords?.[0];
      } else {
        const cnameRecords = await dns.resolveCname(domain);
        result = cnameRecords?.[0];
      }
      
      if (result && result.includes(TUNNEL_ID)) {
        console.log(`✅ ${name}: ${domain} -> ${result}`);
        successCount++;
      } else {
        console.log(`❌ ${name}: 记录不匹配或未找到`);
        console.log(`   期望: ${expectedTarget}`);
        console.log(`   实际: ${result || '未找到'}`);
      }
    } catch (error) {
      console.log(`❌ ${name}: DNS查询失败 - ${error.message}`);
    }
  }
  
  const success = successCount >= 2; // 至少2个DNS服务器验证成功
  console.log(`DNS验证结果: ${successCount}/3 成功，${success ? '通过' : '失败'}`);
  return success;
}

// 2. 检查本地服务状态
async function checkLocalService(port) {
  console.log('\n=== 本地服务检查 ===');
  
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.request({
      hostname: 'localhost',
      port: port,
      path: '/',
      method: 'HEAD',
      timeout: 5000
    }, (res) => {
      console.log(`✅ 本地服务响应: ${res.statusCode}`);
      resolve(res.statusCode < 500);
    });
    
    req.on('error', (error) => {
      console.log(`❌ 本地服务检查失败: ${error.message}`);
      resolve(false);
    });
    
    req.on('timeout', () => {
      console.log('❌ 本地服务响应超时');
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

// 3. 端到端HTTP连通性测试
async function testEndToEndConnectivity(domain, maxAttempts = 5) {
  console.log('\n=== 端到端连通性测试 ===');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🎯 尝试 ${attempt}/${maxAttempts}: 测试 https://${domain}`);
      
      const result = await performHttpRequest(`https://${domain}`);
      
      if (result.success) {
        console.log(`✅ HTTP测试成功! 状态码: ${result.statusCode}`);
        console.log(`响应时间: ${result.responseTime}ms`);
        console.log('响应头:');
        Object.entries(result.headers || {}).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
        return { success: true, attempt, ...result };
      } else {
        console.log(`❌ HTTP测试失败: ${result.error}`);
        
        // 分析错误原因
        if (result.error?.includes('ENOTFOUND')) {
          console.log('   原因: DNS解析失败');
        } else if (result.error?.includes('ECONNREFUSED')) {
          console.log('   原因: 连接被拒绝');
        } else if (result.error?.includes('ETIMEDOUT')) {
          console.log('   原因: 连接超时');
        } else if (result.statusCode === 530) {
          console.log('   原因: Cloudflare错误530 - 源服务器不可达');
        }
      }
      
      if (attempt < maxAttempts) {
        const delay = 3000 * attempt; // 递增延迟
        console.log(`⏳ 等待${delay/1000}秒后重试...`);
        await sleep(delay);
      }
      
    } catch (error) {
      console.log(`❌ 测试异常 (${attempt}/${maxAttempts}): ${error.message}`);
    }
  }
  
  return { success: false, attempts: maxAttempts };
}

// HTTP请求测试函数
function performHttpRequest(url) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const req = https.request(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'TunnelConnectivityTester/1.0',
        'Accept': '*/*',
        'Cache-Control': 'no-cache'
      }
    }, (res) => {
      const responseTime = Date.now() - startTime;
      
      // 收集响应体（用于分析）
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk.toString());
      res.on('end', () => {
        resolve({
          success: res.statusCode >= 200 && res.statusCode < 400,
          statusCode: res.statusCode,
          headers: res.headers,
          responseTime,
          body: responseBody.substring(0, 500) // 只保留前500字符
        });
      });
    });
    
    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      resolve({
        success: false,
        error: error.message,
        code: error.code,
        responseTime
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: '请求超时',
        responseTime: 15000
      });
    });
    
    req.end();
  });
}

// 4. 隧道健康状态检查
async function checkTunnelHealth() {
  console.log('\n=== 隧道健康状态检查 ===');
  
  try {
    // 检查cloudflared进程
    const processes = await new Promise((resolve) => {
      const ps = spawn('ps', ['aux']);
      let output = '';
      
      ps.stdout.on('data', (data) => output += data.toString());
      ps.on('close', () => {
        const cloudflaredProcesses = output.split('\n').filter(line => 
          line.includes('cloudflared') && line.includes('tunnel')
        );
        resolve(cloudflaredProcesses);
      });
    });
    
    console.log(`找到 ${processes.length} 个cloudflared进程`);
    processes.forEach((proc, i) => {
      console.log(`${i + 1}. ${proc.trim().substring(0, 120)}...`);
    });
    
    // 检查配置文件
    const configPath = path.join(process.env.HOME, '.cloudflared', 'config.yml');
    if (fs.existsSync(configPath)) {
      const config = fs.readFileSync(configPath, 'utf8');
      console.log(`✅ 配置文件存在: ${configPath}`);
      
      const hasCorrectTunnel = config.includes(TUNNEL_ID);
      const hasCorrectDomain = config.includes(DOMAIN);
      const hasCorrectService = config.includes(`localhost:${LOCAL_PORT}`);
      
      console.log(`隧道ID配置: ${hasCorrectTunnel ? '✅' : '❌'}`);
      console.log(`域名配置: ${hasCorrectDomain ? '✅' : '❌'}`);
      console.log(`服务配置: ${hasCorrectService ? '✅' : '❌'}`);
      
      return {
        processCount: processes.length,
        configExists: true,
        configCorrect: hasCorrectTunnel && hasCorrectDomain && hasCorrectService
      };
    } else {
      console.log(`❌ 配置文件不存在: ${configPath}`);
      return {
        processCount: processes.length,
        configExists: false,
        configCorrect: false
      };
    }
    
  } catch (error) {
    console.log(`❌ 隧道健康检查失败: ${error.message}`);
    return {
      processCount: 0,
      configExists: false,
      configCorrect: false,
      error: error.message
    };
  }
}

// 5. 综合诊断和修复建议
async function provideDiagnosisAndRecommendations(results) {
  console.log('\n=== 综合诊断和修复建议 ===');
  
  const {
    dnsResult,
    localServiceResult,
    tunnelHealthResult,
    endToEndResult
  } = results;
  
  console.log('诊断结果汇总:');
  console.log(`DNS验证: ${dnsResult ? '✅' : '❌'}`);
  console.log(`本地服务: ${localServiceResult ? '✅' : '❌'}`);
  console.log(`隧道健康: ${tunnelHealthResult.configCorrect ? '✅' : '❌'}`);
  console.log(`端到端连接: ${endToEndResult.success ? '✅' : '❌'}`);
  
  console.log('\n🔍 问题分析:');
  
  // 根据测试结果提供具体建议
  if (!dnsResult) {
    console.log('❌ 主要问题: DNS记录未正确创建或未传播');
    console.log('   建议修复:');
    console.log('   1. 检查Cloudflare API令牌权限');
    console.log('   2. 手动在Cloudflare Dashboard创建CNAME记录');
    console.log(`   3. 记录内容: ${DOMAIN} -> ${EXPECTED_CNAME}`);
    console.log('   4. 等待DNS传播（5-30分钟）');
  } else if (!localServiceResult) {
    console.log('❌ 主要问题: 本地服务不可用');
    console.log('   建议修复:');
    console.log(`   1. 确保端口${LOCAL_PORT}上有服务运行`);
    console.log(`   2. 测试本地访问: curl http://localhost:${LOCAL_PORT}`);
    console.log('   3. 检查防火墙设置');
  } else if (!tunnelHealthResult.configCorrect) {
    console.log('❌ 主要问题: 隧道配置错误');
    console.log('   建议修复:');
    console.log('   1. 重新创建隧道配置文件');
    console.log('   2. 验证ingress规则正确性');
    console.log('   3. 重启cloudflared进程');
  } else if (!endToEndResult.success) {
    console.log('❌ 主要问题: 端到端连接失败');
    console.log('   建议修复:');
    console.log('   1. 检查隧道连接状态');
    console.log('   2. 验证Cloudflare边缘网络路由');
    console.log('   3. 尝试重启隧道');
    console.log('   4. 检查Cloudflare for Teams仪表板');
  } else {
    console.log('✅ 所有检查通过，隧道应该正常工作');
    console.log('如仍有问题，可能是缓存或传播延迟');
  }
  
  // 提供通用修复步骤
  console.log('\n🛠️ 通用修复步骤:');
  console.log('1. 停止所有cloudflared进程');
  console.log('2. 删除现有DNS记录（如有冲突）');
  console.log('3. 重新创建DNS记录');
  console.log('4. 重新启动隧道');
  console.log('5. 等待DNS传播并验证连通性');
  
  return results;
}

// 主要验证流程
async function runValidation() {
  console.log('🚀 开始MVP验证流程...\n');
  
  try {
    // 执行所有测试
    const dnsResult = await verifyDnsRecordEnhanced(DOMAIN, EXPECTED_CNAME);
    const localServiceResult = await checkLocalService(LOCAL_PORT);
    const tunnelHealthResult = await checkTunnelHealth();
    const endToEndResult = await testEndToEndConnectivity(DOMAIN);
    
    const results = {
      dnsResult,
      localServiceResult,
      tunnelHealthResult,
      endToEndResult
    };
    
    // 提供诊断和建议
    await provideDiagnosisAndRecommendations(results);
    
    // 验证结果总结
    const overallSuccess = dnsResult && localServiceResult && 
                          tunnelHealthResult.configCorrect && endToEndResult.success;
    
    console.log('\n' + '='.repeat(60));
    console.log(`🎯 MVP验证结果: ${overallSuccess ? '✅ 成功' : '❌ 需要修复'}`);
    
    if (overallSuccess) {
      console.log('🎉 修复方案验证通过，可以应用到项目代码中');
    } else {
      console.log('🔧 需要进一步调试和修复，请参考上述建议');
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ 验证过程出错:', error);
    return null;
  }
}

// 运行验证
if (require.main === module) {
  runValidation().catch(console.error);
}

module.exports = { runValidation };