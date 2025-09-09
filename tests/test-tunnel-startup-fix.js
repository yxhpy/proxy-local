#!/usr/bin/env node

/**
 * 测试命名隧道启动超时修复效果
 * 
 * 这个测试会模拟用户的场景来验证修复是否有效
 */

const { CloudflareProvider } = require('./src/providers/cloudflare.js');

async function testTunnelStartup() {
    console.log('🧪 开始测试命名隧道启动修复效果...\n');

    const provider = new CloudflareProvider();

    try {
        // 模拟用户的场景：为本地服务创建隧道
        const testPort = 3000;
        const testOptions = {
            customDomain: 'test-fix.yxhpy.xyz',
            background: false  // 前台运行以便观察日志
        };

        console.log(`🚀 尝试为端口 ${testPort} 创建命名隧道...`);
        console.log(`📋 使用域名: ${testOptions.customDomain}`);
        console.log('🔍 请观察调试日志来了解问题所在\n');

        // 启动隧道
        const result = await provider.createTunnel(testPort, testOptions);

        console.log('\n✅ 测试成功！');
        console.log(`🌐 隧道URL: ${result.url}`);
        
        // 让隧道运行一小段时间然后停止
        console.log('\n⏳ 隧道运行5秒后自动停止...');
        
        setTimeout(async () => {
            try {
                await provider.stop();
                console.log('✅ 隧道已停止');
                process.exit(0);
            } catch (err) {
                console.error('❌ 停止隧道时出错:', err.message);
                process.exit(1);
            }
        }, 5000);

    } catch (error) {
        console.error('\n❌ 测试失败!');
        console.error(`错误: ${error.message}`);
        console.error('\n🔍 分析调试日志以了解失败原因');
        
        // 清理
        try {
            await provider.stop();
        } catch (e) {
            // 忽略清理错误
        }
        
        process.exit(1);
    }
}

// 处理 Ctrl+C
process.on('SIGINT', async () => {
    console.log('\n\n⏹️ 收到中断信号，正在清理...');
    
    try {
        const provider = new CloudflareProvider();
        await provider.stop();
    } catch (e) {
        // 忽略清理错误
    }
    
    process.exit(0);
});

// 运行测试
testTunnelStartup().catch(err => {
    console.error('测试脚本出错:', err);
    process.exit(1);
});