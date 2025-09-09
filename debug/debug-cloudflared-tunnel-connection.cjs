#!/usr/bin/env node
/**
 * Debug CloudFlare Tunnel Connection Issue
 * 
 * 问题描述：
 * - 隧道已建立并在cloudflared日志中显示"Registered tunnel connection"
 * - 本地8000端口服务正常运行 
 * - 访问gemini.yxhpy.xyz显示无法访问
 * 
 * 调试目标：
 * 1. 验证DNS记录配置是否正确
 * 2. 检查隧道路由配置
 * 3. 测试端到端连接性
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 配置信息
const CONFIG = {
  tunnelId: '42931f6a-526d-43b2-a749-6ef1f266f6b8',
  domain: 'gemini.yxhpy.xyz', 
  localPort: 8000,
  configFile: '/home/yxhpy/.cloudflared/config.yml'
};

console.log('🔍 CloudFlare隧道连接问题调试工具');
console.log('=====================================');

/**
 * 步骤1: 检查cloudflared配置文件
 */
async function checkConfigFile() {
  console.log('\n1️⃣ 检查cloudflared配置文件...');
  
  try {
    const configContent = fs.readFileSync(CONFIG.configFile, 'utf8');
    console.log('✅ 配置文件内容:');
    console.log(configContent);
    
    // 解析配置检查ingress规则
    const lines = configContent.split('\n');
    let ingressFound = false;
    let correctHostname = false;
    let correctService = false;
    
    for (const line of lines) {
      if (line.includes('hostname:') && line.includes(CONFIG.domain)) {
        correctHostname = true;
        console.log(`✅ 域名配置正确: ${CONFIG.domain}`);
      }
      if (line.includes('service:') && line.includes(`localhost:${CONFIG.localPort}`)) {
        correctService = true;
        console.log(`✅ 服务配置正确: localhost:${CONFIG.localPort}`);
      }
      if (line.includes('ingress:')) {
        ingressFound = true;
      }
    }
    
    if (!ingressFound) console.log('❌ 缺少ingress配置');
    if (!correctHostname) console.log('❌ 域名配置错误');
    if (!correctService) console.log('❌ 服务端口配置错误');
    
    return ingressFound && correctHostname && correctService;
    
  } catch (error) {
    console.log(`❌ 读取配置文件失败: ${error.message}`);
    return false;
  }
}

/**
 * 步骤2: 检查本地服务
 */
async function checkLocalService() {
  console.log('\n2️⃣ 检查本地服务...');
  
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${CONFIG.localPort}`, (res) => {
      console.log(`✅ 本地服务响应: ${res.statusCode} ${res.statusMessage}`);
      console.log(`📋 Content-Type: ${res.headers['content-type']}`);
      console.log(`📏 Content-Length: ${res.headers['content-length']}`);
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (data.length > 0) {
          console.log(`✅ 响应数据长度: ${data.length}字符`);
          // 显示前100个字符
          console.log(`📝 响应内容预览: ${data.substring(0, 100)}...`);
        }
        resolve(true);
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ 本地服务连接失败: ${error.message}`);
      resolve(false);
    });
    
    req.setTimeout(5000, () => {
      console.log('❌ 本地服务响应超时');
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * 步骤3: DNS解析检查
 */
async function checkDNSResolution() {
  console.log('\n3️⃣ 检查DNS解析...');
  
  const dns = require('dns').promises;
  
  try {
    // 检查CNAME记录
    const cnameRecords = await dns.resolveCname(CONFIG.domain);
    console.log(`✅ CNAME记录:`, cnameRecords);
    
    // 检查是否指向cloudflare tunnel
    const expectedCname = `${CONFIG.tunnelId}.cfargotunnel.com`;
    const actualCname = cnameRecords[0];
    
    if (actualCname === expectedCname) {
      console.log('✅ CNAME记录指向正确');
    } else {
      console.log(`❌ CNAME记录错误`);
      console.log(`   期望: ${expectedCname}`);
      console.log(`   实际: ${actualCname}`);
    }
    
    return actualCname === expectedCname;
    
  } catch (error) {
    console.log(`❌ DNS解析失败: ${error.message}`);
    
    // 尝试A记录解析
    try {
      const aRecords = await dns.resolve4(CONFIG.domain);
      console.log(`ℹ️ A记录:`, aRecords);
    } catch (aError) {
      console.log(`❌ A记录解析也失败: ${aError.message}`);
    }
    
    return false;
  }
}

/**
 * 步骤4: HTTP连接测试
 */
async function testHTTPConnection() {
  console.log('\n4️⃣ 测试HTTP连接...');
  
  return new Promise((resolve) => {
    const options = {
      hostname: CONFIG.domain,
      port: 443,
      path: '/',
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'CloudFlare-Tunnel-Debug/1.0'
      }
    };
    
    console.log(`🔍 尝试连接: https://${CONFIG.domain}/`);
    
    const req = https.request(options, (res) => {
      console.log(`✅ HTTP响应: ${res.statusCode} ${res.statusMessage}`);
      console.log('📋 响应头:');
      Object.entries(res.headers).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (data.length > 0) {
          console.log(`✅ 响应数据长度: ${data.length}字符`);
          // 检查是否包含CloudFlare错误页面
          if (data.includes('cloudflare') && data.includes('error')) {
            console.log('⚠️ 可能是CloudFlare错误页面');
          }
          
          // 检查是否包含本地服务内容
          if (data.includes('Gemini Balance') || data.includes('验证页面')) {
            console.log('✅ 包含本地服务内容，隧道工作正常！');
          } else {
            console.log('❌ 未包含期望的本地服务内容');
            console.log(`📝 响应内容预览: ${data.substring(0, 200)}...`);
          }
        }
        resolve(res.statusCode === 200);
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ HTTPS连接失败: ${error.message}`);
      
      // 详细错误分析
      if (error.code === 'ENOTFOUND') {
        console.log('🔍 错误分析: DNS解析失败');
      } else if (error.code === 'ECONNREFUSED') {
        console.log('🔍 错误分析: 连接被拒绝');
      } else if (error.code === 'ETIMEDOUT') {
        console.log('🔍 错误分析: 连接超时');
      } else if (error.code === 'CERT_AUTHORITY_INVALID') {
        console.log('🔍 错误分析: SSL证书问题');
      }
      
      resolve(false);
    });
    
    req.on('timeout', () => {
      console.log('❌ 请求超时');
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

/**
 * 步骤5: CloudFlare边缘连接测试
 */
async function testCloudFlareEdge() {
  console.log('\n5️⃣ 测试CloudFlare边缘连接...');
  
  // 测试多个CloudFlare边缘位置
  const edges = [
    'www.cloudflare.com',
    '1.1.1.1',
    'cloudflare.com'
  ];
  
  for (const edge of edges) {
    try {
      await new Promise((resolve, reject) => {
        const req = https.get(`https://${edge}`, (res) => {
          console.log(`✅ ${edge}: ${res.statusCode}`);
          res.on('data', () => {}); // 消耗数据
          res.on('end', resolve);
        });
        
        req.on('error', reject);
        req.setTimeout(3000, () => {
          req.destroy();
          reject(new Error('超时'));
        });
      });
    } catch (error) {
      console.log(`❌ ${edge}: ${error.message}`);
    }
  }
}

/**
 * 步骤6: 隧道路由验证（如果cloudflared CLI可用）
 */
async function verifyTunnelRoutes() {
  console.log('\n6️⃣ 验证隧道路由...');
  
  const { spawn } = require('child_process');
  
  return new Promise((resolve) => {
    const process = spawn('cloudflared', ['tunnel', 'route', 'list', CONFIG.tunnelId], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        console.log('✅ 隧道路由信息:');
        console.log(stdout);
      } else {
        console.log(`❌ 获取路由信息失败 (exit code: ${code})`);
        if (stderr) console.log('错误输出:', stderr);
      }
      resolve(code === 0);
    });
    
    process.on('error', (error) => {
      console.log(`❌ cloudflared命令执行失败: ${error.message}`);
      resolve(false);
    });
  });
}

/**
 * 主调试流程
 */
async function main() {
  console.log(`🎯 调试目标: ${CONFIG.domain} -> localhost:${CONFIG.localPort}`);
  console.log(`🆔 隧道ID: ${CONFIG.tunnelId}`);
  
  const results = {
    config: await checkConfigFile(),
    localService: await checkLocalService(),
    dns: await checkDNSResolution(),
    http: await testHTTPConnection(),
    tunnelRoutes: await verifyTunnelRoutes()
  };
  
  await testCloudFlareEdge();
  
  console.log('\n📊 调试结果汇总:');
  console.log('==================');
  console.log(`配置文件: ${results.config ? '✅' : '❌'}`);
  console.log(`本地服务: ${results.localService ? '✅' : '❌'}`);
  console.log(`DNS解析: ${results.dns ? '✅' : '❌'}`);
  console.log(`HTTP连接: ${results.http ? '✅' : '❌'}`);
  console.log(`隧道路由: ${results.tunnelRoutes ? '✅' : '❌'}`);
  
  // 问题诊断和建议
  console.log('\n💡 问题诊断和建议:');
  console.log('====================');
  
  if (!results.config) {
    console.log('🔧 建议: 检查cloudflared配置文件格式');
  }
  
  if (!results.localService) {
    console.log('🔧 建议: 确认本地服务正在运行并监听正确端口');
  }
  
  if (!results.dns) {
    console.log('🔧 建议: 等待DNS传播完成（最多几分钟），或检查CloudFlare DNS配置');
  }
  
  if (!results.http) {
    console.log('🔧 建议: 检查防火墙设置，确保CloudFlare可以访问本地服务');
  }
  
  if (results.config && results.localService && !results.dns) {
    console.log('🔍 主要问题可能是: DNS记录未正确创建或传播未完成');
  }
  
  if (results.dns && !results.http) {
    console.log('🔍 主要问题可能是: 隧道配置或CloudFlare路由问题');
  }
  
  console.log('\n🎯 下一步行动建议:');
  if (!results.dns) {
    console.log('1. 等待5-10分钟让DNS传播完成');
    console.log('2. 登录CloudFlare控制台检查DNS记录');
  } else if (!results.http) {
    console.log('1. 重启cloudflared服务');
    console.log('2. 检查本地防火墙设置');
    console.log('3. 验证CloudFlare账户权限');
  }
}

main().catch(console.error);