#!/usr/bin/env node

/**
 * 测试启动后验证机制
 * 
 * 验证内容：
 * 1. 进程存活检测
 * 2. DNS记录验证
 * 3. 综合验证结果
 * 4. 错误情况处理
 */

const { spawn } = require('child_process');
const { writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const TUNNEL_ID = '1391297d-6bad-4306-9516-6718894c76ca';
const DOMAIN = 'gemini.yxhpy.xyz';
const LOCAL_PORT = 8888;

async function testPostStartupValidation() {
    console.log('🧪 测试启动后验证机制...\n');
    
    let tunnelProcess = null;
    
    try {
        // 1. 创建配置并启动隧道
        const configPath = createTunnelConfig(TUNNEL_ID, LOCAL_PORT, DOMAIN);
        console.log(`✅ 配置文件: ${configPath}\n`);
        
        console.log('1. 启动隧道进程:');
        tunnelProcess = await startTunnelProcess(TUNNEL_ID, configPath);
        console.log(`✅ 隧道进程启动 (PID: ${tunnelProcess.pid})\n`);
        
        // 2. 等待连接建立
        console.log('2. 等待隧道连接建立:');
        const connected = await waitForConnection(tunnelProcess, 15000);
        console.log(connected ? '✅ 隧道连接建立' : '❌ 隧道连接失败');
        console.log('');
        
        // 3. 测试启动后验证机制
        console.log('3. 测试启动后验证机制:');
        const validationResult = await performPostStartupValidation(tunnelProcess, DOMAIN, TUNNEL_ID);
        
        displayValidationResult(validationResult);
        
        // 4. 测试进程终止后的验证
        console.log('\n4. 测试进程终止后的验证:');
        tunnelProcess.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const postKillValidation = await performPostStartupValidation(tunnelProcess, DOMAIN, TUNNEL_ID);
        displayValidationResult(postKillValidation, '进程终止后');
        
        console.log('\n🎉 启动后验证测试完成');
        
    } catch (error) {
        console.error(`❌ 测试失败: ${error.message}`);
    } finally {
        // 确保进程清理
        if (tunnelProcess && !tunnelProcess.killed) {
            tunnelProcess.kill('SIGKILL');
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

async function startTunnelProcess(tunnelId, configPath) {
    const args = ['tunnel', '--config', configPath, 'run', tunnelId];
    console.log(`启动命令: cloudflared ${args.join(' ')}`);
    
    const child = spawn('cloudflared', args, {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // 基本日志捕获
    child.stdout.on('data', (data) => {
        console.log(`[stdout] ${data.toString().trim()}`);
    });
    
    child.stderr.on('data', (data) => {
        console.log(`[stderr] ${data.toString().trim()}`);
    });
    
    child.on('exit', (code, signal) => {
        console.log(`进程退出: 代码=${code}, 信号=${signal}`);
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
                console.log('  🎉 检测到隧道连接建立信号');
                resolve(true);
            }
        };
        
        tunnelProcess.stdout.on('data', checkConnection);
        tunnelProcess.stderr.on('data', checkConnection);
    });
}

async function performPostStartupValidation(child, domain, tunnelId) {
    console.log('🔍 开始启动后完整性验证...');
    
    const result = {
        processAlive: false,
        dnsConfigured: false
    };
    
    try {
        // 1. 检查进程存活状态
        console.log('📋 检查1/2: 验证隧道进程存活状态');
        result.processAlive = await verifyProcessAlive(child);
        
        if (result.processAlive) {
            console.log('  ✅ 隧道进程存活正常');
        } else {
            console.log('  ❌ 隧道进程未存活或已退出');
        }
        
        // 2. 检查DNS记录配置状态
        console.log('📋 检查2/2: 验证DNS记录配置状态');
        const expectedTarget = `${tunnelId}.cfargotunnel.com`;
        result.dnsConfigured = await verifyDnsRecord(domain, expectedTarget);
        
        if (result.dnsConfigured) {
            console.log('  ✅ DNS记录配置正确');
        } else {
            console.log('  ⚠️ DNS记录未配置或传播中');
        }
        
        // 3. 综合评估
        const overallStatus = result.processAlive && result.dnsConfigured ? 'SUCCESS' : 'PARTIAL';
        console.log(`📊 验证结果: ${overallStatus}`);
        
        return result;
        
    } catch (error) {
        console.log(`❌ 启动后验证过程发生错误: ${error.message}`);
        return result;
    }
}

async function verifyProcessAlive(child) {
    try {
        // 检查进程对象状态
        if (!child || child.killed) {
            return false;
        }
        
        // 检查PID是否存在
        if (!child.pid) {
            return false;
        }
        
        // 使用signal 0检查进程是否真实存在（不会杀死进程）
        try {
            process.kill(child.pid, 0);
            return true;
        } catch (killError) {
            // ESRCH表示进程不存在，EPERM表示权限不足但进程存在
            if (killError.code === 'EPERM') {
                return true; // 权限问题但进程存在
            }
            return false; // 进程不存在
        }
        
    } catch (error) {
        console.log(`⚠️ 进程存活检查异常: ${error.message}`);
        return false;
    }
}

async function verifyDnsRecord(domain, expectedTarget) {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    try {
        // 使用多个DNS服务器验证
        const dnsServers = ['1.1.1.1', '8.8.8.8'];
        let successCount = 0;
        
        for (const server of dnsServers) {
            try {
                const { stdout } = await execAsync(`dig @${server} ${domain} CNAME +short`);
                const result = stdout.trim();
                
                if (result === expectedTarget) {
                    successCount++;
                }
                
                console.log(`  DNS查询 @${server}: ${result || '(无记录)'}`);
            } catch (error) {
                console.log(`  DNS查询 @${server}: 查询失败`);
            }
        }
        
        return successCount > 0;
        
    } catch (error) {
        console.log(`  DNS验证异常: ${error.message}`);
        return false;
    }
}

function displayValidationResult(result, prefix = '') {
    const title = prefix ? `${prefix}验证结果` : '验证结果';
    console.log(`📋 ${title}:`);
    console.log(`  • 进程存活状态: ${result.processAlive ? '✅' : '❌'}`);
    console.log(`  • DNS记录配置: ${result.dnsConfigured ? '✅' : '❌'}`);
    
    if (result.processAlive && result.dnsConfigured) {
        console.log('  🎉 验证完全通过');
    } else if (result.processAlive || result.dnsConfigured) {
        console.log('  ⚠️ 验证部分通过');
    } else {
        console.log('  ❌ 验证失败');
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    testPostStartupValidation().catch(console.error);
}

module.exports = { testPostStartupValidation };