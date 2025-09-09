#!/usr/bin/env node

/**
 * 测试文件：验证隧道进程管理问题
 * 
 * 测试内容：
 * 1. 模拟隧道创建流程
 * 2. 检查进程启动和生命周期管理
 * 3. 验证子进程是否正确启动并持续运行
 */

const { spawn } = require('child_process');

async function testTunnelProcessManagement() {
    console.log('🧪 开始测试隧道进程管理...\n');
    
    // 测试用的隧道ID（从debug中获取的最新ID）
    const tunnelId = '1391297d-6bad-4306-9516-6718894c76ca';
    
    console.log('1. 测试cloudflared命令是否可用:');
    try {
        const versionCheck = spawn('cloudflared', ['version'], { stdio: 'pipe' });
        
        versionCheck.stdout.on('data', (data) => {
            console.log(`✅ cloudflared版本: ${data.toString().trim()}`);
        });
        
        await new Promise((resolve, reject) => {
            versionCheck.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`cloudflared version 命令失败，退出码: ${code}`));
                }
            });
            versionCheck.on('error', reject);
        });
        
    } catch (error) {
        console.log(`❌ cloudflared不可用: ${error.message}`);
        return;
    }
    
    console.log('\n2. 测试隧道运行命令:');
    console.log(`执行命令: cloudflared tunnel run ${tunnelId}`);
    
    const tunnelProcess = spawn('cloudflared', ['tunnel', 'run', tunnelId], {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let processStarted = false;
    let connectionEstablished = false;
    
    // 监听标准输出
    tunnelProcess.stdout.on('data', (data) => {
        const text = data.toString();
        console.log(`[stdout] ${text.trim()}`);
        
        if (text.includes('Registered tunnel connection') || 
            text.includes('connection established') ||
            text.includes('INF') && text.includes('connection=')) {
            connectionEstablished = true;
            console.log('✅ 隧道连接已建立');
        }
    });
    
    // 监听标准错误
    tunnelProcess.stderr.on('data', (data) => {
        const text = data.toString();
        console.log(`[stderr] ${text.trim()}`);
        
        if (text.includes('Registered tunnel connection')) {
            connectionEstablished = true;
            console.log('✅ 隧道连接已建立 (从stderr检测到)');
        }
        
        // 检查配置错误
        if (text.includes('no configuration file found') || 
            text.includes('failed to start tunnel')) {
            console.log('❌ 隧道配置问题检测到');
        }
    });
    
    // 监听进程启动
    tunnelProcess.on('spawn', () => {
        processStarted = true;
        console.log(`✅ 隧道进程已启动 (PID: ${tunnelProcess.pid})`);
    });
    
    // 监听进程退出
    tunnelProcess.on('exit', (code, signal) => {
        console.log(`❌ 隧道进程退出 - 代码: ${code}, 信号: ${signal}`);
    });
    
    // 监听进程错误
    tunnelProcess.on('error', (error) => {
        console.log(`❌ 隧道进程错误: ${error.message}`);
    });
    
    // 等待10秒来观察进程行为
    console.log('\n⏳ 等待10秒观察进程行为...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('\n📊 测试结果汇总:');
    console.log(`- 进程启动: ${processStarted ? '✅' : '❌'}`);
    console.log(`- 连接建立: ${connectionEstablished ? '✅' : '❌'}`);
    console.log(`- 进程存活: ${!tunnelProcess.killed && tunnelProcess.pid ? '✅' : '❌'}`);
    
    // 检查进程是否仍在运行
    if (tunnelProcess.pid) {
        try {
            process.kill(tunnelProcess.pid, 0); // 不杀死进程，只检查存在性
            console.log(`- 进程状态: 运行中 (PID: ${tunnelProcess.pid})`);
        } catch (error) {
            console.log(`- 进程状态: 不存在`);
        }
    }
    
    // 清理进程
    console.log('\n🧹 清理测试进程...');
    if (!tunnelProcess.killed) {
        tunnelProcess.kill();
        console.log('✅ 测试进程已终止');
    }
    
    console.log('\n🧪 测试完成');
}

// 如果直接运行此脚本
if (require.main === module) {
    testTunnelProcessManagement().catch(console.error);
}

module.exports = { testTunnelProcessManagement };