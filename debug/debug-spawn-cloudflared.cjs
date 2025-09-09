#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 DEBUG: 调试spawn cloudflared代码段');

// 模拟当前的配置
const tunnelId = '1a6ab0e3-4e77-48be-8ba9-ade05c0be270';
const domain = 'gemini.yxhpy.xyz';
const port = 8000;

async function debugSpawnCloudflared() {
    console.log('\n📋 当前配置:');
    console.log(`隧道ID: ${tunnelId}`);
    console.log(`域名: ${domain}`);
    console.log(`本地端口: ${port}`);
    
    // 1. 检查配置文件
    const configPath = '/home/yxhpy/.cloudflared/config.yml';
    console.log(`\n🔍 检查配置文件: ${configPath}`);
    
    if (fs.existsSync(configPath)) {
        const config = fs.readFileSync(configPath, 'utf8');
        console.log('配置文件内容:');
        console.log('---');
        console.log(config);
        console.log('---');
    } else {
        console.log('❌ 配置文件不存在');
        return;
    }
    
    // 2. 检查凭据文件
    const credPath = `/home/yxhpy/.cloudflared/${tunnelId}.json`;
    console.log(`\n🔍 检查凭据文件: ${credPath}`);
    console.log(`凭据文件存在: ${fs.existsSync(credPath)}`);
    
    if (!fs.existsSync(credPath)) {
        console.log('❌ 凭据文件不存在，隧道无法启动');
        return;
    }
    
    // 3. 模拟spawn逻辑
    console.log('\n🚀 模拟spawn cloudflared启动...');
    const args = ['tunnel', 'run', tunnelId];
    console.log(`执行命令: cloudflared ${args.join(' ')}`);
    
    const child = spawn('cloudflared', args, {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let resolved = false;
    let connectionEstablished = false;
    
    console.log('⏰ 设置60秒超时监控...');
    const timeout = setTimeout(() => {
        if (!resolved) {
            console.log('❌ 60秒超时，进程将被终止');
            child.kill('SIGTERM');
            resolved = true;
        }
    }, 60000);
    
    child.stdout.on('data', (data) => {
        const text = data.toString();
        console.log(`[STDOUT] ${text.trim()}`);
        
        // 检查关键输出
        if (text.includes('Registered tunnel connection')) {
            console.log('✅ 检测到隧道连接注册成功');
            connectionEstablished = true;
        }
        
        if (text.includes('connection established')) {
            console.log('✅ 检测到连接建立');
            connectionEstablished = true;
        }
        
        if (text.includes('INF') && text.includes('connection=')) {
            console.log('✅ 检测到INFO级别连接信息');
            connectionEstablished = true;
        }
        
        // 如果连接建立且未resolve，则resolve
        if (connectionEstablished && !resolved) {
            console.log('🎉 隧道启动成功，准备验证访问...');
            resolved = true;
            clearTimeout(timeout);
            
            // 等待3秒后测试访问
            setTimeout(async () => {
                await testTunnelAccess();
                child.kill('SIGTERM');
            }, 3000);
        }
    });
    
    child.stderr.on('data', (data) => {
        const text = data.toString();
        console.log(`[STDERR] ${text.trim()}`);
        
        // stderr也可能包含成功信息
        if (text.includes('Registered tunnel connection')) {
            console.log('✅ [STDERR] 检测到隧道连接注册成功');
            connectionEstablished = true;
        }
        
        if (text.includes('connection established')) {
            console.log('✅ [STDERR] 检测到连接建立');
            connectionEstablished = true;
        }
        
        if (text.includes('INF') && text.includes('connection=')) {
            console.log('✅ [STDERR] 检测到INFO级别连接信息');
            connectionEstablished = true;
        }
        
        // 如果连接建立且未resolve，则resolve
        if (connectionEstablished && !resolved) {
            console.log('🎉 隧道启动成功，准备验证访问...');
            resolved = true;
            clearTimeout(timeout);
            
            // 等待3秒后测试访问
            setTimeout(async () => {
                await testTunnelAccess();
                child.kill('SIGTERM');
            }, 3000);
        }
        
        // 检查错误
        if (text.includes('connection refused') || text.includes('failed to connect')) {
            console.log('❌ 检测到连接错误');
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                child.kill('SIGTERM');
            }
        }
    });
    
    child.on('exit', (code) => {
        console.log(`\n🔚 cloudflared进程退出，代码: ${code}`);
        if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
        }
    });
    
    child.on('error', (error) => {
        console.log(`❌ 进程启动错误: ${error.message}`);
        if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
        }
    });
}

async function testTunnelAccess() {
    console.log('\n🌐 测试隧道访问...');
    
    return new Promise((resolve) => {
        const testChild = spawn('curl', ['-I', '--connect-timeout', '5', '--max-time', '10', `https://${domain}`], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let error = '';
        
        testChild.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        testChild.stderr.on('data', (data) => {
            error += data.toString();
        });
        
        testChild.on('close', (code) => {
            if (code === 0) {
                console.log('✅ 隧道访问测试成功');
                console.log('响应头:');
                console.log(output.split('\n').slice(0, 3).join('\n'));
            } else {
                console.log(`❌ 隧道访问失败 (code: ${code})`);
                console.log('错误信息:', error.trim());
            }
            resolve();
        });
        
        setTimeout(() => {
            testChild.kill();
            console.log('⏰ 访问测试超时');
            resolve();
        }, 10000);
    });
}

debugSpawnCloudflared();