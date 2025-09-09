#!/usr/bin/env node

/**
 * Debug脚本：深入分析隧道启动流程问题
 * 
 * 根本问题分析：
 * 1. waitForNamedTunnelStartup() 理论上应该在第一个 "Registered tunnel connection" 时resolve
 * 2. 但实际执行中，隧道仍然因为超时而被终止
 * 3. 可能是因为resolve后，仍然有其他代码路径导致进程被kill
 * 
 * 关键发现：
 * - closeTunnel() 方法会发送 SIGTERM 给 cloudflared 进程
 * - 在 catch 块中会调用 closeTunnel()
 * - 这可能造成竞态条件：即使resolve了，catch仍然执行了
 */

import chalk from 'chalk';

console.log(chalk.blue('🔍 隧道启动流程深度分析'));
console.log(chalk.blue('=' .repeat(60)));

// 模拟waitForNamedTunnelStartup的执行流程
function simulateWaitForNamedTunnelStartup() {
    console.log(chalk.yellow('\n📋 模拟 waitForNamedTunnelStartup 执行流程：'));
    
    return new Promise((resolve, reject) => {
        let resolved = false;
        
        // 60秒超时
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                console.log(chalk.red('❌ 超时触发 - reject("命名隧道启动超时")'));
                reject(new Error('命名隧道启动超时'));
            }
        }, 60000);
        
        // 模拟实际的日志事件
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.log(chalk.green('✅ 匹配成功 - resolve()'));
                resolve();
            }
        }, 3000); // 3秒后成功（模拟实际情况）
    });
}

// 模拟包含waitForNamedTunnelStartup的完整流程
async function simulateFullFlow() {
    console.log(chalk.yellow('\n📋 模拟完整的认证后流程：'));
    
    try {
        console.log('1. 启动 cloudflared 子进程...');
        
        console.log('2. 等待隧道启动确认...');
        await simulateWaitForNamedTunnelStartup();
        
        console.log('3. ✅ waitForNamedTunnelStartup 成功返回');
        console.log('4. 设置 finalUrl...');
        console.log('5. 显示成功消息...');
        console.log('6. 验证域名连接...');
        console.log('7. 启动健康监控...');
        console.log('8. 返回隧道结果...');
        
        return { success: true };
        
    } catch (error) {
        console.log(chalk.red(`❌ 认证后流程失败: ${error.message}`));
        
        // 这里会调用 closeTunnel()
        console.log(chalk.red('🗑️ 调用 closeTunnel() 清理进程'));
        
        // 模拟 closeTunnel() 的影响
        console.log('   - 发送 SIGTERM 给 cloudflared 进程');
        console.log('   - 设置 5秒后 SIGKILL 超时');
        console.log('   - 进程被强制终止');
        
        throw error;
    }
}

console.log(chalk.blue('\n🎯 问题根因分析：'));
console.log('根据日志输出，隧道进程确实建立了连接，这意味着：');
console.log('1. waitForNamedTunnelStartup() 应该成功resolve');
console.log('2. 但随后立即显示"命名隧道启动超时"');
console.log('3. 这说明发生了竞态条件或逻辑错误');

console.log(chalk.blue('\n🔧 可能的原因：'));
console.log('1. 子进程的 exit 事件在 resolve 之后触发，导致 reject');
console.log('2. 超时计时器没有被正确清理');  
console.log('3. 存在多个监听器导致重复处理');
console.log('4. 外部信号(SIGTERM)导致进程意外退出');

console.log(chalk.blue('\n💡 建议的修复策略：'));
console.log('1. 增加更详细的debug日志，追踪resolve/reject的确切时机');
console.log('2. 检查是否有多个事件监听器');
console.log('3. 确保timeout被正确清理');
console.log('4. 检查child.on("exit")事件处理逻辑');
console.log('5. 增加resolved状态的原子性检查');

console.log(chalk.yellow('\n🧪 测试修复方案：'));
try {
    await simulateFullFlow();
    console.log(chalk.green('✅ 流程模拟完成'));
} catch (error) {
    console.log(chalk.red(`❌ 流程模拟失败: ${error.message}`));
}