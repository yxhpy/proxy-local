#!/usr/bin/env node

/**
 * Debug文件：分析Cloudflare隧道显示成功但无法访问的问题
 * 根据任务70的分析，主要调查以下几个方面：
 * 1. DNS传播状态检查
 * 2. Ingress配置验证  
 * 3. 隧道连接状态验证
 * 4. 端到端连通性测试
 */

const { spawn } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 从日志输出中提取隧道ID和域名
const TUNNEL_ID = '392a61b1-88c5-4765-b749-b0f271ad8914';
const DOMAIN = 'gemini.yxhpy.xyz';
const LOCAL_PORT = 8000;

console.log('🔍 开始调试Cloudflare隧道访问问题...');
console.log(`隧道ID: ${TUNNEL_ID}`);
console.log(`域名: ${DOMAIN}`);
console.log(`本地端口: ${LOCAL_PORT}`);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. 检查DNS记录状态
async function checkDNSRecord() {
  console.log('\n=== 1. DNS记录检查 ===');
  
  return new Promise((resolve) => {
    const dig = spawn('dig', ['+short', 'CNAME', DOMAIN]);
    let output = '';
    let error = '';
    
    dig.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    dig.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    dig.on('close', (code) => {
      console.log(`DNS查询结果: ${output.trim()}`);
      console.log(`期望结果: ${TUNNEL_ID}.cfargotunnel.com.`);
      
      const expectedCNAME = `${TUNNEL_ID}.cfargotunnel.com.`;
      const actualCNAME = output.trim();
      
      if (actualCNAME.includes(TUNNEL_ID)) {
        console.log('✅ DNS记录正确');
        resolve(true);
      } else {
        console.log('❌ DNS记录不匹配或未传播');
        console.log(`实际: ${actualCNAME}`);
        console.log(`期望: ${expectedCNAME}`);
        resolve(false);
      }
    });
  });
}

// 2. 检查配置文件
async function checkConfigFile() {
  console.log('\n=== 2. 隧道配置文件检查 ===');
  
  const configPath = path.join(process.env.HOME, '.cloudflared', 'config.yml');
  
  if (!fs.existsSync(configPath)) {
    console.log('❌ 配置文件不存在:', configPath);
    return false;
  }
  
  try {
    const config = fs.readFileSync(configPath, 'utf8');
    console.log('配置文件内容:');
    console.log(config);
    
    // 检查关键配置
    const hasCorrectTunnelId = config.includes(TUNNEL_ID);
    const hasCorrectDomain = config.includes(DOMAIN);
    const hasCorrectService = config.includes(`localhost:${LOCAL_PORT}`);
    
    console.log(`✅ 包含隧道ID: ${hasCorrectTunnelId}`);
    console.log(`✅ 包含域名: ${hasCorrectDomain}`);
    console.log(`✅ 包含本地服务: ${hasCorrectService}`);
    
    return hasCorrectTunnelId && hasCorrectDomain && hasCorrectService;
  } catch (error) {
    console.log('❌ 读取配置文件失败:', error.message);
    return false;
  }
}

// 3. 检查隧道进程状态
async function checkTunnelProcess() {
  console.log('\n=== 3. 隧道进程状态检查 ===');
  
  return new Promise((resolve) => {
    const ps = spawn('ps', ['aux']);
    let output = '';
    
    ps.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ps.on('close', () => {
      const cloudflaredProcesses = output.split('\n').filter(line => 
        line.includes('cloudflared') && line.includes('tunnel')
      );
      
      console.log(`找到 ${cloudflaredProcesses.length} 个cloudflared进程:`);
      cloudflaredProcesses.forEach((process, index) => {
        console.log(`${index + 1}. ${process.trim()}`);
      });
      
      // 检查是否有多个进程冲突
      if (cloudflaredProcesses.length > 1) {
        console.log('⚠️ 发现多个cloudflared进程，可能存在冲突');
      } else if (cloudflaredProcesses.length === 1) {
        console.log('✅ 隧道进程正常运行');
      } else {
        console.log('❌ 未找到运行中的隧道进程');
      }
      
      resolve(cloudflaredProcesses.length);
    });
  });
}

// 4. 检查本地服务状态
async function checkLocalService() {
  console.log('\n=== 4. 本地服务检查 ===');
  
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.request({
      hostname: 'localhost',
      port: LOCAL_PORT,
      path: '/',
      method: 'HEAD',
      timeout: 5000
    }, (res) => {
      console.log(`✅ 本地服务响应: ${res.statusCode}`);
      resolve(true);
    });
    
    req.on('error', (error) => {
      console.log(`❌ 本地服务无响应: ${error.message}`);
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

// 5. 端到端连通性测试
async function testEndToEndConnectivity() {
  console.log('\n=== 5. 端到端连通性测试 ===');
  
  return new Promise((resolve) => {
    const req = https.request({
      hostname: DOMAIN,
      path: '/',
      method: 'HEAD',
      timeout: 10000,
      headers: {
        'User-Agent': 'CloudflareTunnelDebugger/1.0'
      }
    }, (res) => {
      console.log(`✅ 端到端连接成功: ${res.statusCode}`);
      console.log('响应头:');
      Object.entries(res.headers).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
      resolve(true);
    });
    
    req.on('error', (error) => {
      console.log(`❌ 端到端连接失败: ${error.message}`);
      if (error.code === 'ENOTFOUND') {
        console.log('   DNS解析失败，可能DNS还未传播完成');
      } else if (error.code === 'ECONNREFUSED') {
        console.log('   连接被拒绝，可能隧道未正确配置');
      } else if (error.code === 'ETIMEDOUT') {
        console.log('   连接超时，可能网络问题或隧道未建立');
      }
      resolve(false);
    });
    
    req.on('timeout', () => {
      console.log('❌ 端到端连接超时');
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

// 6. Cloudflare API检查DNS记录
async function checkCloudflareAPI() {
  console.log('\n=== 6. Cloudflare API DNS记录检查 ===');
  
  // 这里需要API密钥，先跳过实际调用
  console.log('⚠️ 需要Cloudflare API密钥才能执行此检查');
  console.log('建议手动在Cloudflare仪表板检查DNS记录状态');
  
  return true;
}

// 主要诊断流程
async function runDiagnostics() {
  console.log('🚀 开始完整诊断流程...\n');
  
  const results = {};
  
  // 执行所有检查
  results.dns = await checkDNSRecord();
  results.config = await checkConfigFile();
  results.process = await checkTunnelProcess();
  results.localService = await checkLocalService();
  results.endToEnd = await testEndToEndConnectivity();
  results.cloudflareAPI = await checkCloudflareAPI();
  
  // 汇总结果
  console.log('\n=== 诊断结果汇总 ===');
  console.log(`DNS记录: ${results.dns ? '✅' : '❌'}`);
  console.log(`配置文件: ${results.config ? '✅' : '❌'}`);
  console.log(`隧道进程: ${results.process > 0 ? '✅' : '❌'}`);
  console.log(`本地服务: ${results.localService ? '✅' : '❌'}`);
  console.log(`端到端连接: ${results.endToEnd ? '✅' : '❌'}`);
  
  // 问题分析
  console.log('\n=== 问题分析 ===');
  
  if (!results.dns) {
    console.log('🔍 主要问题: DNS记录未正确配置或未传播');
    console.log('   解决方案: 等待DNS传播或检查DNS配置');
  } else if (!results.localService) {
    console.log('🔍 主要问题: 本地服务未运行');
    console.log('   解决方案: 启动本地服务在端口 ' + LOCAL_PORT);
  } else if (!results.endToEnd && results.dns && results.localService) {
    console.log('🔍 主要问题: DNS已传播，本地服务正常，但端到端连接失败');
    console.log('   可能原因: 隧道配置问题或Cloudflare路由问题');
  } else if (results.endToEnd) {
    console.log('🎉 所有检查通过，隧道应该正常工作');
  }
  
  return results;
}

// 运行诊断
if (require.main === module) {
  runDiagnostics().catch(console.error);
}

module.exports = { runDiagnostics };