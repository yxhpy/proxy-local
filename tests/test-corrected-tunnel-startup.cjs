#!/usr/bin/env node

/**
 * 测试修正后的隧道启动流程
 */

const { spawn } = require('child_process');
const { writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const TUNNEL_ID = '1391297d-6bad-4306-9516-6718894c76ca';
const DOMAIN = 'gemini.yxhpy.xyz';
const LOCAL_PORT = 8888;

async function testCorrectedTunnelStartup() {
    console.log('🧪 测试修正后的隧道启动流程...\n');
    
    // 1. 创建正确的配置文件
    console.log('1. 创建隧道配置文件:');
    const configPath = createTunnelConfig(TUNNEL_ID, LOCAL_PORT, DOMAIN);
    console.log(`✅ 配置文件创建: ${configPath}`);
    
    // 2. 显示配置内容
    console.log('\n2. 配置文件内容:');
    const { readFileSync } = require('fs');
    console.log(readFileSync(configPath, 'utf8'));
    
    // 3. 启动隧道（使用配置文件）
    console.log('\n3. 启动隧道进程:');
    const args = ['tunnel', '--config', configPath, 'run', TUNNEL_ID];
    console.log(`执行命令: cloudflared ${args.join(' ')}`);
    
    const tunnelProcess = spawn('cloudflared', args, {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let connectionEstablished = false;
    let processStarted = false;
    
    // 监听进程启动
    tunnelProcess.on('spawn', () => {
        processStarted = true;
        console.log(`✅ 隧道进程启动 (PID: ${tunnelProcess.pid})`);
    });
    
    // 监听输出
    tunnelProcess.stdout.on('data', (data) => {
        const text = data.toString();
        console.log(`[stdout] ${text.trim()}`);
        
        if (text.includes('Registered tunnel connection') || 
            text.includes('connection established') ||
            (text.includes('INF') && text.includes('connection='))) {
            connectionEstablished = true;
            console.log('🎉 隧道连接建立成功！');
        }
    });
    
    tunnelProcess.stderr.on('data', (data) => {
        const text = data.toString();
        console.log(`[stderr] ${text.trim()}`);
        
        if (text.includes('Registered tunnel connection')) {
            connectionEstablished = true;
            console.log('🎉 隧道连接建立成功！(从stderr检测)');
        }
    });
    
    // 监听进程事件
    tunnelProcess.on('error', (error) => {
        console.log(`❌ 进程错误: ${error.message}`);
    });
    
    tunnelProcess.on('exit', (code, signal) => {
        console.log(`📊 进程退出 - 代码: ${code}, 信号: ${signal}`);
    });
    
    // 等待15秒观察结果
    console.log('\n⏳ 等待15秒观察隧道建立情况...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    console.log('\n📊 测试结果:');
    console.log(`- 进程启动: ${processStarted ? '✅' : '❌'}`);
    console.log(`- 连接建立: ${connectionEstablished ? '✅' : '❌'}`);
    console.log(`- 进程存活: ${!tunnelProcess.killed ? '✅' : '❌'}`);
    
    // 清理
    if (!tunnelProcess.killed) {
        tunnelProcess.kill();
        console.log('🧹 测试进程已清理');
    }
    
    return { processStarted, connectionEstablished };
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

// 如果直接运行此脚本
if (require.main === module) {
    testCorrectedTunnelStartup().catch(console.error);
}

module.exports = { testCorrectedTunnelStartup };