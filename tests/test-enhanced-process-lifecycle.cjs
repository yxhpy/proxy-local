#!/usr/bin/env node

/**
 * 测试增强的进程生命周期管理
 * 
 * 验证内容：
 * 1. 进程启动日志捕获
 * 2. 错误处理机制
 * 3. 进程退出清理
 * 4. 日志分级显示
 */

const { spawn } = require('child_process');
const { writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const TUNNEL_ID = '1391297d-6bad-4306-9516-6718894c76ca';
const DOMAIN = 'gemini.yxhpy.xyz';
const LOCAL_PORT = 8888;

async function testEnhancedProcessLifecycle() {
    console.log('🧪 测试增强的进程生命周期管理...\n');
    
    let tunnelProcess = null;
    
    try {
        // 1. 创建配置文件
        const configPath = createTunnelConfig(TUNNEL_ID, LOCAL_PORT, DOMAIN);
        console.log(`✅ 配置文件: ${configPath}\n`);
        
        // 2. 启动隧道并应用生命周期管理
        console.log('2. 启动隧道并设置生命周期管理:');
        tunnelProcess = startTunnelWithLifecycle(TUNNEL_ID, configPath, DOMAIN);
        
        // 3. 等待并观察日志
        console.log('\n3. 等待15秒观察进程行为和日志...');
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        // 4. 测试正常退出
        console.log('\n4. 测试正常退出流程:');
        await testGracefulShutdown(tunnelProcess, DOMAIN);
        
        console.log('\n🎉 生命周期管理测试完成');
        
    } catch (error) {
        console.error(`❌ 测试失败: ${error.message}`);
    } finally {
        // 确保进程清理
        if (tunnelProcess && !tunnelProcess.killed) {
            console.log('\n🧹 最终清理进程...');
            tunnelProcess.kill('SIGTERM');
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

function startTunnelWithLifecycle(tunnelId, configPath, domain) {
    const args = ['tunnel', '--config', configPath, 'run', tunnelId];
    console.log(`启动命令: cloudflared ${args.join(' ')}`);
    
    const child = spawn('cloudflared', args, {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // 应用生命周期管理（模拟cloudflare.js中的逻辑）
    setupProcessLifecycleManagement(child, domain);
    
    return child;
}

function setupProcessLifecycleManagement(child, domain) {
    console.log(`🔧 设置隧道进程生命周期管理: PID ${child.pid}`);
    
    // 捕获标准输出并记录日志
    child.stdout.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
            console.log(`[隧道-stdout] ${text}`);
        }
    });
    
    // 捕获标准错误并记录日志（关键：cloudflared主要日志在stderr）
    child.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
            // 根据日志内容选择不同的标识
            if (text.includes('ERR') || text.includes('failed')) {
                console.log(`❌ [隧道-stderr] ${text}`);
            } else if (text.includes('WRN') || text.includes('WARN')) {
                console.log(`⚠️ [隧道-stderr] ${text}`);
            } else if (text.includes('INF') || text.includes('Registered tunnel connection')) {
                console.log(`ℹ️ [隧道-stderr] ${text}`);
            } else {
                console.log(`📝 [隧道-stderr] ${text}`);
            }
        }
    });
    
    // 监听进程错误事件
    child.on('error', (error) => {
        console.log(`❌ 隧道进程发生错误 (${domain}): ${error.message}`);
        console.log(`错误详情: ${error.stack || 'N/A'}`);
        
        if (!child.killed) {
            console.log('⚠️ 进程错误但未终止，继续监控...');
        }
    });
    
    // 监听进程退出事件
    child.on('exit', (code, signal) => {
        const exitInfo = signal ? `信号: ${signal}` : `退出码: ${code}`;
        
        if (code === 0) {
            console.log(`ℹ️ 隧道进程正常退出 (${domain}) - ${exitInfo}`);
        } else {
            console.log(`❌ 隧道进程异常退出 (${domain}) - ${exitInfo}`);
            
            // 提供诊断信息
            if (code === 1) {
                console.log('💡 退出码1通常表示配置错误或权限问题');
            } else if (signal === 'SIGTERM') {
                console.log('💡 进程被正常终止（SIGTERM）');
            } else if (signal === 'SIGKILL') {
                console.log('💡 进程被强制终止（SIGKILL）');
            }
        }
    });
    
    // 监听进程spawn事件
    child.on('spawn', () => {
        console.log(`✅ 隧道进程启动成功 (${domain}): PID ${child.pid}`);
    });
    
    // 设置进程清理处理
    const cleanup = () => {
        if (child && !child.killed) {
            console.log(`🧹 清理隧道进程 (${domain}): PID ${child.pid}`);
            child.kill('SIGTERM');
            
            // 如果5秒后还没退出，强制终止
            setTimeout(() => {
                if (child && !child.killed) {
                    console.log(`🔨 强制终止隧道进程: PID ${child.pid}`);
                    child.kill('SIGKILL');
                }
            }, 5000);
        }
    };
    
    // 注册清理处理器
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('exit', cleanup);
    
    console.log('✅ 进程生命周期管理设置完成');
}

async function testGracefulShutdown(tunnelProcess, domain) {
    return new Promise((resolve) => {
        console.log('发送SIGTERM信号进行优雅退出...');
        
        // 监听退出事件
        tunnelProcess.once('exit', (code, signal) => {
            console.log(`进程退出完成: 代码=${code}, 信号=${signal}`);
            resolve();
        });
        
        // 发送优雅退出信号
        tunnelProcess.kill('SIGTERM');
        
        // 5秒超时
        setTimeout(() => {
            if (!tunnelProcess.killed) {
                console.log('优雅退出超时，强制终止...');
                tunnelProcess.kill('SIGKILL');
            }
            resolve();
        }, 5000);
    });
}

// 如果直接运行此脚本
if (require.main === module) {
    testEnhancedProcessLifecycle().catch(console.error);
}

module.exports = { testEnhancedProcessLifecycle };