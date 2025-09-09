#!/usr/bin/env node

/**
 * 测试DNS删除-轮询-创建修复方案
 * 验证新的智能DNS冲突解决逻辑
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class DnsFixTester {
    constructor() {
        this.testDomain = 'test-dns-fix.yxhpy.xyz'; // 测试用域名
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const prefix = {
            'INFO': '🔍',
            'SUCCESS': '✅', 
            'ERROR': '❌',
            'WARN': '⚠️',
            'TEST': '🧪'
        };
        
        console.log(`[${timestamp}] ${prefix[level] || '📋'} ${message}`);
        if (data) {
            console.log('   详情:', JSON.stringify(data, null, 2));
        }
    }

    /**
     * 执行隧道创建命令测试修复方案
     */
    async testTunnelCreation() {
        this.log('TEST', '=== 开始测试DNS删除-轮询-创建修复方案 ===');
        
        return new Promise((resolve) => {
            this.log('INFO', `使用域名 ${this.testDomain} 测试修复方案...`);
            
            // 执行隧道创建命令，使用测试端口
            const tunnelProcess = spawn('node', ['./bin/index.js', '8000'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env }
            });

            let stdout = '';
            let stderr = '';
            let hasPrompted = false;

            tunnelProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                
                this.log('INFO', 'Tunnel stdout:', output.trim());
                
                // 检测到域名输入提示
                if (output.includes('请输入您要使用的自定义域名') && !hasPrompted) {
                    hasPrompted = true;
                    this.log('TEST', `输入测试域名: ${this.testDomain}`);
                    tunnelProcess.stdin.write(`${this.testDomain}\n`);
                }
                
                // 检测DNS冲突智能解决启动
                if (output.includes('启动智能DNS冲突解决机制')) {
                    this.log('SUCCESS', '✅ 智能DNS冲突解决机制已启动');
                }
                
                // 检测删除逻辑执行
                if (output.includes('改为删除现有记录')) {
                    this.log('SUCCESS', '✅ 新的删除逻辑已执行');
                }
                
                // 检测轮询确认
                if (output.includes('轮询确认DNS记录删除')) {
                    this.log('SUCCESS', '✅ 轮询确认机制已启动');
                }
                
                // 检测删除确认成功
                if (output.includes('DNS记录删除确认成功')) {
                    this.log('SUCCESS', '✅ DNS记录删除确认成功');
                }
                
                // 检测cloudflared创建成功
                if (output.includes('cloudflared现在可以成功创建')) {
                    this.log('SUCCESS', '✅ cloudflared准备创建新记录');
                }
                
                // 检测最终成功
                if (output.includes('隧道已启动') || output.includes('Tunnel started')) {
                    this.log('SUCCESS', '🎉 修复方案测试成功！隧道创建成功');
                    tunnelProcess.kill();
                    resolve(true);
                }
            });

            tunnelProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                this.log('WARN', 'Tunnel stderr:', output.trim());
            });

            tunnelProcess.on('close', (code) => {
                this.log('INFO', `隧道进程退出，代码: ${code}`);
                
                if (stdout.includes('DNS记录删除确认成功')) {
                    this.log('SUCCESS', '✅ 修复方案核心逻辑工作正常');
                    resolve(true);
                } else {
                    this.log('ERROR', '❌ 修复方案测试未完全成功');
                    resolve(false);
                }
            });

            tunnelProcess.on('error', (error) => {
                this.log('ERROR', '隧道进程错误:', error.message);
                resolve(false);
            });

            // 设置测试超时
            setTimeout(() => {
                this.log('WARN', '测试超时，终止进程...');
                tunnelProcess.kill();
                resolve(false);
            }, 60000); // 60秒超时
        });
    }

    /**
     * 模拟用户选择更新现有记录的场景
     */
    async simulateUpdateChoice() {
        this.log('TEST', '模拟用户选择更新现有DNS记录的场景');
        // 这里可以添加自动化交互逻辑
        return true;
    }
}

// 主函数
async function main() {
    const tester = new DnsFixTester();
    
    try {
        const success = await tester.testTunnelCreation();
        
        if (success) {
            console.log('\n🎉 修复方案测试成功！');
            console.log('✅ DNS删除-轮询-创建流程工作正常');
            process.exit(0);
        } else {
            console.log('\n❌ 修复方案测试失败');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ 测试过程出错:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = DnsFixTester;