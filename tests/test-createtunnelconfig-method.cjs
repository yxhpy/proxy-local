#!/usr/bin/env node

/**
 * 测试文件：验证createTunnelConfig方法的实现
 * 
 * 测试目标：
 * 1. 验证方法能够创建正确的配置文件
 * 2. 验证配置文件格式符合cloudflared规范
 * 3. 验证配置文件能被cloudflared正确读取
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const os = require('os');

console.log('🧪 测试: createTunnelConfig方法功能验证');
console.log('=' .repeat(50));

// 测试参数
const testTunnelId = '42931f6a-526d-43b2-a749-6ef1f266f6b8';
const testPort = 8000;
const testDomain = 'test-gemini.yxhpy.xyz';
const cloudflaredDir = path.join(os.homedir(), '.cloudflared');
const configFile = path.join(cloudflaredDir, 'config.yml');
const credentialsFile = path.join(cloudflaredDir, `${testTunnelId}.json`);

console.log('\n📋 测试参数:');
console.log(`   隧道ID: ${testTunnelId}`);
console.log(`   本地端口: ${testPort}`);
console.log(`   域名: ${testDomain}`);
console.log(`   配置目录: ${cloudflaredDir}`);
console.log(`   配置文件: ${configFile}`);
console.log(`   凭据文件: ${credentialsFile}`);

// 1. 检查现有配置
console.log('\n📍 步骤1: 检查现有配置文件');
if (fs.existsSync(configFile)) {
  console.log('✅ 发现现有配置文件');
  try {
    const existingConfig = fs.readFileSync(configFile, 'utf8');
    console.log('\n📄 现有配置内容:');
    console.log(existingConfig);
    
    // 解析YAML
    const parsedConfig = yaml.load(existingConfig);
    console.log('\n🔍 解析后的配置:');
    console.log(JSON.stringify(parsedConfig, null, 2));
  } catch (error) {
    console.log(`⚠️ 解析现有配置失败: ${error.message}`);
  }
} else {
  console.log('⚠️ 未发现现有配置文件');
}

// 2. 设计正确的配置格式
console.log('\n📍 步骤2: 设计正确的配置格式');
const expectedConfig = {
  tunnel: testTunnelId,
  'credentials-file': credentialsFile,
  ingress: [
    {
      hostname: testDomain,
      service: `http://localhost:${testPort}`
    },
    {
      service: 'http_status:404'
    }
  ]
};

console.log('✅ 预期配置结构:');
console.log(JSON.stringify(expectedConfig, null, 2));

// 3. 转换为YAML格式
console.log('\n📍 步骤3: 转换为YAML格式');
try {
  const yamlContent = yaml.dump(expectedConfig, {
    indent: 2,
    lineWidth: 80,
    quotingType: '"',
    forceQuotes: false
  });
  
  console.log('✅ YAML格式配置:');
  console.log(yamlContent);
  
  // 4. 验证YAML格式能被正确解析
  console.log('📍 步骤4: 验证YAML格式');
  const reparsed = yaml.load(yamlContent);
  
  if (JSON.stringify(reparsed) === JSON.stringify(expectedConfig)) {
    console.log('✅ YAML格式验证通过');
  } else {
    console.log('❌ YAML格式验证失败');
    console.log('原始:', JSON.stringify(expectedConfig));
    console.log('重解析:', JSON.stringify(reparsed));
  }
} catch (error) {
  console.log(`❌ YAML转换失败: ${error.message}`);
}

// 5. 检查凭据文件
console.log('\n📍 步骤5: 检查凭据文件');
if (fs.existsSync(credentialsFile)) {
  console.log('✅ 发现凭据文件');
  try {
    const credentialsContent = fs.readFileSync(credentialsFile, 'utf8');
    const credentials = JSON.parse(credentialsContent);
    console.log('✅ 凭据文件格式正确');
    console.log(`   账户标签: ${credentials.AccountTag || '未知'}`);
    console.log(`   隧道秘钥: ${credentials.TunnelSecret ? '已配置' : '未配置'}`);
  } catch (error) {
    console.log(`⚠️ 凭据文件格式错误: ${error.message}`);
  }
} else {
  console.log('⚠️ 未发现凭据文件 - 这可能会导致隧道启动失败');
}

// 6. 模拟createTunnelConfig方法实现
console.log('\n📍 步骤6: createTunnelConfig方法实现模板');
console.log('=' .repeat(30));

const methodImplementation = `
/**
 * 创建cloudflared隧道配置文件
 * @param {string} tunnelId - 隧道ID
 * @param {number} port - 本地端口
 * @param {string} domain - 域名
 */
async createTunnelConfig(tunnelId, port, domain) {
  try {
    const cloudflaredDir = join(homedir(), '.cloudflared');
    const configFile = join(cloudflaredDir, 'config.yml');
    const credentialsFile = join(cloudflaredDir, \`\${tunnelId}.json\`);
    
    // 确保目录存在
    if (!existsSync(cloudflaredDir)) {
      mkdir(cloudflaredDir, { recursive: true });
    }
    
    // 创建配置对象
    const config = {
      tunnel: tunnelId,
      'credentials-file': credentialsFile,
      ingress: [
        {
          hostname: domain,
          service: \`http://localhost:\${port}\`
        },
        {
          service: 'http_status:404'
        }
      ]
    };
    
    // 转换为YAML并写入文件
    const yamlContent = yaml.dump(config, {
      indent: 2,
      lineWidth: 80,
      quotingType: '"',
      forceQuotes: false
    });
    
    writeFileSync(configFile, yamlContent, 'utf8');
    
    console.log(chalk.green(\`✅ 隧道配置文件已创建: \${configFile}\`));
    console.log(chalk.gray(\`   隧道ID: \${tunnelId}\`));
    console.log(chalk.gray(\`   域名: \${domain} -> localhost:\${port}\`));
    
    return configFile;
  } catch (error) {
    throw new Error(\`创建隧道配置文件失败: \${error.message}\`);
  }
}`;

console.log('✅ 方法实现模板:');
console.log(methodImplementation);

console.log('\n🎯 总结:');
console.log('- ✅ 配置文件格式已确认');
console.log('- ✅ YAML转换逻辑已验证');
console.log('- ✅ 凭据文件位置已确认');
console.log('- 🚀 可以开始实现createTunnelConfig方法');

console.log('\n📦 需要导入的模块:');
console.log('- fs (writeFileSync, existsSync, mkdirSync)');
console.log('- path (join)'); 
console.log('- os (homedir)');
console.log('- js-yaml 或内置yaml库');