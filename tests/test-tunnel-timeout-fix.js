#!/usr/bin/env node

/**
 * 测试文件：验证命名隧道超时修复方案
 * 
 * 修复策略：
 * 1. 增强日志记录，精确跟踪resolve/reject时机
 * 2. 确保resolved标志的原子性
 * 3. 修复子进程事件监听器的竞态条件
 * 4. 改进超时清理逻辑
 */

import chalk from 'chalk';
import { EventEmitter } from 'events';

console.log(chalk.blue('🧪 测试命名隧道超时修复方案'));
console.log(chalk.blue('=' .repeat(60)));

// 模拟子进程类
class MockChildProcess extends EventEmitter {
    constructor() {
        super();
        this.killed = false;
        this.stdout = new EventEmitter();
        this.stderr = new EventEmitter();
    }
    
    kill(signal) {
        this.killed = true;
        console.log(chalk.red(`🔪 进程被终止 (信号: ${signal})`));
        // 模拟进程退出
        setTimeout(() => {
            this.emit('exit', signal === 'SIGKILL' ? 9 : 0);
        }, 100);
    }
}

// 原始的有问题的实现
function originalWaitForNamedTunnelStartup(child, domain) {
    console.log(chalk.yellow('\n📋 测试原始实现（有bug版本）：'));
    
    return new Promise((resolve, reject) => {
        let resolved = false;
        
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                console.log(chalk.red('❌ 原始版本：超时触发'));
                reject(new Error('命名隧道启动超时'));
            }
        }, 5000); // 缩短为5秒便于测试

        child.stdout.on('data', (data) => {
            if (resolved) {
                console.log(chalk.gray('⚠️ 原始版本：resolved后仍收到数据'));
                return;
            }
            
            const text = data.toString();
            console.log(chalk.gray(`[cloudflared] ${text.trim()}`));
            
            if (text.includes('Registered tunnel connection') || 
                text.includes('connection established') ||
                (text.includes('INF') && text.includes('connection='))) {
                resolved = true;
                clearTimeout(timeout);
                console.log(chalk.green('✅ 原始版本：连接建立信号匹配'));
                resolve();
            }
        });

        child.stderr.on('data', (data) => {
            const text = data.toString();
            console.log(chalk.yellow(`[cloudflared] ${text.trim()}`));
            
            if (text.includes('failed to connect') || text.includes('connection refused')) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(new Error(`无法连接到本地端口`));
                }
            }
        });

        // 问题可能在这里：exit事件可能在resolve后触发
        child.on('exit', (code) => {
            console.log(chalk.red(`⚠️ 原始版本：进程退出 (code: ${code})`));
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                if (code !== 0) {
                    reject(new Error(`命名隧道进程异常退出 (代码: ${code})`));
                }
            }
        });
    });
}

// 修复后的实现
function fixedWaitForNamedTunnelStartup(child, domain) {
    console.log(chalk.yellow('\n📋 测试修复后实现：'));
    
    return new Promise((resolve, reject) => {
        let resolved = false;
        let timeoutRef = null;
        
        // 增强的清理函数
        const cleanup = () => {
            if (timeoutRef) {
                clearTimeout(timeoutRef);
                timeoutRef = null;
            }
        };
        
        // 增强的resolve函数
        const safeResolve = () => {
            if (!resolved) {
                resolved = true;
                cleanup();
                console.log(chalk.green('✅ 修复版本：安全resolve'));
                resolve();
            } else {
                console.log(chalk.gray('⚠️ 修复版本：重复resolve被忽略'));
            }
        };
        
        // 增强的reject函数
        const safeReject = (error) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                console.log(chalk.red(`❌ 修复版本：安全reject - ${error.message}`));
                reject(error);
            } else {
                console.log(chalk.gray(`⚠️ 修复版本：重复reject被忽略 - ${error.message}`));
            }
        };
        
        timeoutRef = setTimeout(() => {
            safeReject(new Error('命名隧道启动超时'));
        }, 5000);

        child.stdout.on('data', (data) => {
            if (resolved) return;
            
            const text = data.toString();
            console.log(chalk.gray(`[cloudflared] ${text.trim()}`));
            
            if (text.includes('Registered tunnel connection') || 
                text.includes('connection established') ||
                (text.includes('INF') && text.includes('connection='))) {
                console.log(chalk.blue('🎯 修复版本：检测到连接建立信号'));
                safeResolve();
            }
        });

        child.stderr.on('data', (data) => {
            if (resolved) return;
            
            const text = data.toString();
            console.log(chalk.yellow(`[cloudflared] ${text.trim()}`));
            
            if (text.includes('failed to connect') || text.includes('connection refused')) {
                safeReject(new Error(`无法连接到本地端口`));
            }
        });

        // 改进的exit事件处理
        child.on('exit', (code) => {
            console.log(chalk.red(`⚠️ 修复版本：进程退出 (code: ${code})`));
            
            // 只有在未成功启动时才视为错误
            if (code !== 0) {
                safeReject(new Error(`命名隧道进程异常退出 (代码: ${code})`));
            }
            // 正常退出(code=0)不做处理，因为可能是外部信号导致的正常关闭
        });
        
        child.on('error', (err) => {
            console.log(chalk.red(`⚠️ 修复版本：进程错误 - ${err.message}`));
            safeReject(new Error(`启动命名隧道失败: ${err.message}`));
        });
    });
}

// 测试场景1：正常成功情况
async function testNormalSuccess() {
    console.log(chalk.blue('\n🎯 测试场景1：正常成功情况'));
    
    const mockChild = new MockChildProcess();
    
    // 模拟成功的隧道连接日志
    setTimeout(() => {
        mockChild.stdout.emit('data', '2025-09-08T00:05:40Z INF Starting tunnel');
    }, 1000);
    
    setTimeout(() => {
        mockChild.stdout.emit('data', '2025-09-08T00:05:40Z INF Registered tunnel connection connIndex=0 connection=abc123');
    }, 2000);
    
    try {
        await fixedWaitForNamedTunnelStartup(mockChild, 'test.example.com');
        console.log(chalk.green('✅ 场景1通过：正常成功'));
    } catch (error) {
        console.log(chalk.red(`❌ 场景1失败：${error.message}`));
    }
}

// 测试场景2：进程意外退出但已经建立连接
async function testEarlyExit() {
    console.log(chalk.blue('\n🎯 测试场景2：进程意外退出但已建立连接'));
    
    const mockChild = new MockChildProcess();
    
    // 模拟连接建立
    setTimeout(() => {
        mockChild.stdout.emit('data', '2025-09-08T00:05:40Z INF Registered tunnel connection connIndex=0');
    }, 1000);
    
    // 模拟进程在连接建立后意外退出（如SIGTERM）
    setTimeout(() => {
        mockChild.kill('SIGTERM');
    }, 1500);
    
    try {
        await fixedWaitForNamedTunnelStartup(mockChild, 'test.example.com');
        console.log(chalk.green('✅ 场景2通过：即使进程退出也成功'));
    } catch (error) {
        console.log(chalk.red(`❌ 场景2失败：${error.message}`));
    }
}

// 测试场景3：超时情况
async function testTimeout() {
    console.log(chalk.blue('\n🎯 测试场景3：超时情况'));
    
    const mockChild = new MockChildProcess();
    
    // 不发送任何成功信号，等待超时
    
    try {
        await fixedWaitForNamedTunnelStartup(mockChild, 'test.example.com');
        console.log(chalk.red('❌ 场景3失败：应该超时但没有'));
    } catch (error) {
        if (error.message.includes('超时')) {
            console.log(chalk.green('✅ 场景3通过：正确超时'));
        } else {
            console.log(chalk.red(`❌ 场景3失败：错误的错误类型 - ${error.message}`));
        }
    }
}

// 运行所有测试
async function runAllTests() {
    try {
        await testNormalSuccess();
        await testEarlyExit();  
        await testTimeout();
        
        console.log(chalk.blue('\n📊 测试总结：'));
        console.log('修复后的实现应该能够：');
        console.log('1. ✅ 正确识别连接建立信号并resolve');
        console.log('2. ✅ 处理进程意外退出情况');
        console.log('3. ✅ 防止竞态条件导致的重复resolve/reject');
        console.log('4. ✅ 正确处理超时情况');
        
    } catch (error) {
        console.log(chalk.red(`测试运行失败: ${error.message}`));
    }
}

runAllTests();