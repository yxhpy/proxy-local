#!/usr/bin/env node

/**
 * 测试完整隧道流程
 * 
 * 包括：
 * 1. 隧道配置文件创建
 * 2. 隧道进程启动（使用配置文件）
 * 3. DNS记录验证和创建
 * 4. 完整流程验证
 */

const { spawn, exec } = require('child_process');
const { writeFileSync, readFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const util = require('util');
const execAsync = util.promisify(exec);

const TUNNEL_ID = '1391297d-6bad-4306-9516-6718894c76ca';
const DOMAIN = 'gemini.yxhpy.xyz';
const LOCAL_PORT = 8888;

async function testCompleteTunnelFlow() {
    console.log('🧪 测试完整隧道流程...\n');
    
    let tunnelProcess = null;
    
    try {
        // 1. 创建配置文件
        console.log('1. 创建隧道配置文件:');
        const configPath = createTunnelConfig(TUNNEL_ID, LOCAL_PORT, DOMAIN);
        console.log(`✅ 配置文件: ${configPath}`);
        
        // 2. 启动隧道进程
        console.log('\n2. 启动隧道进程:');
        tunnelProcess = await startTunnelWithConfig(TUNNEL_ID, configPath);
        console.log(`✅ 隧道进程启动 (PID: ${tunnelProcess.pid})`);
        
        // 3. 等待连接建立
        console.log('\n3. 等待隧道连接建立:');
        const connected = await waitForConnection(tunnelProcess, 20000);
        console.log(connected ? '✅ 隧道连接成功建立' : '❌ 隧道连接建立超时');
        
        // 4. 验证DNS（核心测试点）
        console.log('\n4. 验证DNS记录状态:');
        await verifyDNSRecord(DOMAIN, `${TUNNEL_ID}.cfargotunnel.com`);
        
        // 5. 如果DNS不存在，模拟API创建
        console.log('\n5. 模拟DNS API创建流程:');
        await simulateDNSAPICreation(TUNNEL_ID, DOMAIN);
        
        console.log('\n🎉 测试流程完成');
        
    } catch (error) {
        console.error(`❌ 测试失败: ${error.message}`);
    } finally {
        // 清理进程
        if (tunnelProcess && !tunnelProcess.killed) {
            console.log('\n🧹 清理隧道进程...');
            tunnelProcess.kill();
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

function createTunnelConfig(tunnelId, port, domain) {
    const configDir = join(homedir(), '.cloudflared');
    const configPath = join(configDir, 'config.yml');
    const credentialsPath = join(configDir, `${tunnelId}.json`);
    
    const config = `
tunnel: ${tunnelId}
credentials-file: ${credentialsPath}

ingress:
  - hostname: ${domain}
    service: http://localhost:${port}
  - service: http_status:404
`.trim();
    
    writeFileSync(configPath, config, 'utf8');
    return configPath;
}

async function startTunnelWithConfig(tunnelId, configPath) {
    const args = ['tunnel', '--config', configPath, 'run', tunnelId];
    console.log(`执行命令: cloudflared ${args.join(' ')}`);
    
    const child = spawn('cloudflared', args, {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // 设置日志监听
    child.stdout.on('data', (data) => {
        console.log(`[stdout] ${data.toString().trim()}`);
    });
    
    child.stderr.on('data', (data) => {
        console.log(`[stderr] ${data.toString().trim()}`);
    });
    
    child.on('error', (error) => {
        console.log(`❌ 进程错误: ${error.message}`);
    });
    
    child.on('exit', (code, signal) => {
        console.log(`📊 进程退出 - 代码: ${code}, 信号: ${signal}`);
    });
    
    // 等待进程启动
    await new Promise((resolve, reject) => {
        child.on('spawn', resolve);
        child.on('error', reject);
        setTimeout(() => reject(new Error('进程启动超时')), 5000);
    });
    
    return child;
}

async function waitForConnection(tunnelProcess, timeout = 15000) {
    return new Promise((resolve) => {
        let connected = false;
        const timer = setTimeout(() => {
            if (!connected) {
                resolve(false);
            }
        }, timeout);
        
        const checkConnection = (data) => {
            const text = data.toString();
            if (text.includes('Registered tunnel connection') && !connected) {
                connected = true;
                clearTimeout(timer);
                console.log('🎉 检测到隧道连接建立信号');
                resolve(true);
            }
        };
        
        tunnelProcess.stdout.on('data', checkConnection);
        tunnelProcess.stderr.on('data', checkConnection);
    });
}

async function verifyDNSRecord(domain, expectedTarget) {
    try {
        console.log(`验证DNS记录: ${domain} -> ${expectedTarget}`);
        
        // 多重验证
        const dnsResults = [];
        
        // 1. 使用Cloudflare DNS
        try {
            const { stdout: cf } = await execAsync(`dig @1.1.1.1 ${domain} CNAME +short`);
            dnsResults.push({ server: '1.1.1.1', result: cf.trim() });
        } catch (e) {
            dnsResults.push({ server: '1.1.1.1', result: 'ERROR' });
        }
        
        // 2. 使用Google DNS
        try {
            const { stdout: google } = await execAsync(`dig @8.8.8.8 ${domain} CNAME +short`);
            dnsResults.push({ server: '8.8.8.8', result: google.trim() });
        } catch (e) {
            dnsResults.push({ server: '8.8.8.8', result: 'ERROR' });
        }
        
        // 3. 系统默认DNS
        try {
            const { stdout: system } = await execAsync(`dig ${domain} CNAME +short`);
            dnsResults.push({ server: 'system', result: system.trim() });
        } catch (e) {
            dnsResults.push({ server: 'system', result: 'ERROR' });
        }
        
        console.log('DNS查询结果:');
        dnsResults.forEach(({ server, result }) => {
            const status = result === expectedTarget ? '✅' : 
                          result === '' ? '❌ (无记录)' : 
                          result === 'ERROR' ? '❌ (查询失败)' : 
                          `❌ (${result})`;
            console.log(`  ${server}: ${status}`);
        });
        
        const validResults = dnsResults.filter(r => r.result === expectedTarget);
        console.log(`DNS验证结果: ${validResults.length}/${dnsResults.length} 服务器返回正确记录`);
        
        return validResults.length > 0;
        
    } catch (error) {
        console.log(`❌ DNS验证失败: ${error.message}`);
        return false;
    }
}

async function simulateDNSAPICreation(tunnelId, domain) {
    console.log('模拟DNS API创建（实际需要API令牌）...');
    
    const cnameTarget = `${tunnelId}.cfargotunnel.com`;
    
    console.log(`需要创建的记录:`);
    console.log(`  类型: CNAME`);
    console.log(`  名称: ${domain}`);
    console.log(`  目标: ${cnameTarget}`);
    console.log(`  TTL: 300 (5分钟)`);
    
    console.log('\n💡 手动创建步骤:');
    console.log('1. 登录Cloudflare控制面板');
    console.log('2. 进入yxhpy.xyz域名管理');
    console.log('3. 添加DNS记录:');
    console.log(`   - 类型: CNAME`);
    console.log(`   - 名称: gemini`);
    console.log(`   - 目标: ${cnameTarget}`);
    console.log('4. 保存记录');
    
    // 模拟API调用（需要实际的API令牌）
    console.log('\n🔧 模拟API调用结果: 需要有效的API令牌');
}

// 如果直接运行此脚本
if (require.main === module) {
    testCompleteTunnelFlow().catch(console.error);
}

module.exports = { testCompleteTunnelFlow };