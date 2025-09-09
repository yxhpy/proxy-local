#!/usr/bin/env node

/**
 * 修复文件：完整修复隧道配置和进程管理问题
 * 
 * 修复内容：
 * 1. 确保隧道配置文件正确创建
 * 2. 修复cloudflared进程启动逻辑
 * 3. 实现进程生命周期管理
 * 4. 添加配置验证和错误处理
 */

const { spawn, exec } = require('child_process');
const { writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const util = require('util');
const execAsync = util.promisify(exec);

// 测试隧道配置
const TUNNEL_ID = '1391297d-6bad-4306-9516-6718894c76ca';
const DOMAIN = 'gemini.yxhpy.xyz';
const LOCAL_PORT = 8888; // 假设的本地端口

async function fixTunnelConfiguration() {
    console.log('🔧 开始修复隧道配置和进程管理...\n');
    
    try {
        // 1. 创建隧道配置文件
        console.log('1. 创建隧道配置文件:');
        const configPath = await createTunnelConfig(TUNNEL_ID, LOCAL_PORT, DOMAIN);
        console.log(`✅ 配置文件创建成功: ${configPath}`);
        
        // 2. 验证配置文件
        console.log('\n2. 验证隧道配置:');
        const isValidConfig = await validateTunnelConfig(configPath);
        if (!isValidConfig) {
            throw new Error('隧道配置文件无效');
        }
        console.log('✅ 隧道配置验证通过');
        
        // 3. 启动隧道进程（使用配置文件）
        console.log('\n3. 启动隧道进程:');
        const tunnelProcess = await startTunnelProcess(TUNNEL_ID, configPath);
        console.log(`✅ 隧道进程启动成功 (PID: ${tunnelProcess.pid})`);
        
        // 4. 等待连接建立
        console.log('\n4. 等待隧道连接建立:');
        const connectionSuccess = await waitForTunnelConnection(tunnelProcess, DOMAIN);
        
        if (connectionSuccess) {
            console.log('✅ 隧道连接建立成功');
            
            // 5. 验证DNS和访问
            console.log('\n5. 验证DNS和访问:');
            await verifyTunnelAccess(DOMAIN);
            
        } else {
            console.log('❌ 隧道连接失败');
        }
        
        // 6. 进程清理（仅用于测试）
        console.log('\n6. 清理测试进程...');
        if (tunnelProcess && !tunnelProcess.killed) {
            tunnelProcess.kill();
            console.log('✅ 测试进程已清理');
        }
        
    } catch (error) {
        console.error(`❌ 修复过程失败: ${error.message}`);
        throw error;
    }
}

/**
 * 创建隧道配置文件
 */
async function createTunnelConfig(tunnelId, port, domain) {
    const configDir = join(homedir(), '.cloudflared');
    const configPath = join(configDir, 'config.yml');
    
    // 检查credentials文件是否存在
    const credentialsPath = join(configDir, `${tunnelId}.json`);
    if (!existsSync(credentialsPath)) {
        throw new Error(`凭证文件不存在: ${credentialsPath}`);
    }
    
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

/**
 * 验证隧道配置文件
 */
async function validateTunnelConfig(configPath) {
    try {
        const { stdout } = await execAsync(`cloudflared tunnel validate ${configPath}`);
        console.log(`配置验证输出: ${stdout}`);
        return true;
    } catch (error) {
        console.log(`❌ 配置验证失败: ${error.message}`);
        return false;
    }
}

/**
 * 启动隧道进程
 */
async function startTunnelProcess(tunnelId, configPath) {
    const args = ['tunnel', '--config', configPath, 'run', tunnelId];
    console.log(`执行命令: cloudflared ${args.join(' ')}`);
    
    const child = spawn('cloudflared', args, {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // 实现日志捕获
    child.stdout.on('data', (data) => {
        console.log(`[cloudflared stdout] ${data.toString().trim()}`);
    });
    
    child.stderr.on('data', (data) => {
        console.log(`[cloudflared stderr] ${data.toString().trim()}`);
    });
    
    // 实现错误处理
    child.on('error', (error) => {
        console.log(`❌ 隧道进程错误: ${error.message}`);
    });
    
    child.on('exit', (code, signal) => {
        console.log(`📊 隧道进程退出 - 代码: ${code}, 信号: ${signal}`);
    });
    
    // 等待进程启动
    await new Promise((resolve, reject) => {
        child.on('spawn', resolve);
        child.on('error', reject);
        setTimeout(() => reject(new Error('进程启动超时')), 5000);
    });
    
    return child;
}

/**
 * 等待隧道连接建立
 */
async function waitForTunnelConnection(tunnelProcess, domain) {
    return new Promise((resolve) => {
        let connectionEstablished = false;
        const timeout = setTimeout(() => {
            if (!connectionEstablished) {
                console.log('⏰ 连接等待超时');
                resolve(false);
            }
        }, 15000);
        
        const checkConnection = (data) => {
            const text = data.toString();
            if (text.includes('Registered tunnel connection') || 
                text.includes('connection established') ||
                (text.includes('INF') && text.includes('connection='))) {
                
                if (!connectionEstablished) {
                    connectionEstablished = true;
                    clearTimeout(timeout);
                    console.log('🎉 检测到隧道连接建立信号');
                    resolve(true);
                }
            }
        };
        
        tunnelProcess.stdout.on('data', checkConnection);
        tunnelProcess.stderr.on('data', checkConnection);
    });
}

/**
 * 验证隧道访问
 */
async function verifyTunnelAccess(domain) {
    try {
        // 检查DNS解析
        const { stdout: digResult } = await execAsync(`dig ${domain} CNAME +short`);
        console.log(`DNS CNAME记录: ${digResult.trim()}`);
        
        // 尝试访问
        const { stdout: curlResult } = await execAsync(`curl -I -m 10 https://${domain}`, { timeout: 15000 });
        console.log('✅ 隧道访问测试成功');
        console.log(curlResult);
        
    } catch (error) {
        console.log(`⚠️ 隧道访问测试失败: ${error.message}`);
        console.log('💡 这可能是正常的，因为DNS传播需要时间');
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    fixTunnelConfiguration().catch(console.error);
}

module.exports = { 
    fixTunnelConfiguration,
    createTunnelConfig,
    startTunnelProcess,
    waitForTunnelConnection
};