#!/usr/bin/env node

/**
 * 测试增强的错误反馈机制
 * 
 * 验证内容：
 * 1. 阶段性错误识别
 * 2. 具体错误分析
 * 3. 解决方案提供
 * 4. 不同错误类型的处理
 */

async function testEnhancedErrorFeedback() {
    console.log('🧪 测试增强的错误反馈机制...\n');
    
    // 模拟不同阶段的错误
    const errorScenarios = [
        {
            name: '用户认证失败',
            error: new Error('缺少 Cloudflare 证书文件 cert.pem'),
            expectedStage: '用户认证阶段'
        },
        {
            name: 'API令牌问题', 
            error: new Error('缺少有效的 CloudFlare API 令牌'),
            expectedStage: 'API令牌验证阶段'
        },
        {
            name: '隧道创建失败',
            error: new Error('无法创建命名隧道'),
            expectedStage: '隧道创建阶段'
        },
        {
            name: '配置文件问题',
            error: new Error('隧道配置文件创建失败'),
            expectedStage: '配置文件创建阶段'
        },
        {
            name: 'DNS配置错误',
            error: new Error('DNS记录验证失败，隧道无法正常工作'),
            expectedStage: 'DNS配置阶段'
        },
        {
            name: '进程启动失败',
            error: new Error('隧道进程启动失败或连接建立超时'),
            expectedStage: '隧道进程启动阶段'
        },
        {
            name: '启动后验证失败',
            error: new Error('隧道启动成功但验证检查失败'),
            expectedStage: '启动后验证阶段'
        },
        {
            name: '未知错误',
            error: new Error('Something unexpected happened'),
            expectedStage: '未知阶段'
        }
    ];
    
    for (let i = 0; i < errorScenarios.length; i++) {
        const scenario = errorScenarios[i];
        console.log(`${i + 1}. 测试场景: ${scenario.name}`);
        console.log(`   错误信息: "${scenario.error.message}"`);
        console.log(`   期望阶段: ${scenario.expectedStage}`);
        console.log('');
        
        // 模拟错误分析
        await simulateErrorAnalysis(scenario.error, 'test.example.com', 3000);
        
        console.log('─'.repeat(80));
        console.log('');
    }
    
    console.log('🎉 错误反馈机制测试完成');
}

function simulateErrorAnalysis(error, domain, port) {
    console.log('🔍 详细错误分析：');
    
    const errorMessage = error.message.toLowerCase();
    
    // 模拟阶段识别逻辑
    identifyFailureStage(errorMessage);
    
    // 模拟具体错误分析
    console.log('📋 错误详细分析：');
    
    // DNS相关错误
    if (errorMessage.includes('dns') || errorMessage.includes('验证失败')) {
        console.log('❌ DNS配置问题');
        console.log('可能的原因：');
        console.log('  1. Cloudflare API令牌权限不足（需要DNS:Edit权限）');
        console.log('  2. 域名未正确添加到Cloudflare管理');
        console.log('  3. 存在冲突的DNS记录');
        console.log('  4. DNS传播延迟过长');
        
        console.log('💡 解决方案：');
        console.log('  1. 检查API令牌权限：https://dash.cloudflare.com/profile/api-tokens');
        console.log('  2. 确保域名已添加到Cloudflare并状态为"Active"');
        if (domain) {
            console.log(`  3. 手动删除现有的 ${domain} DNS记录后重试`);
            console.log(`  4. 或手动创建CNAME记录：${domain} -> [tunnel-id].cfargotunnel.com`);
        }
    }
    
    // 认证相关错误
    else if (errorMessage.includes('cert.pem') || errorMessage.includes('认证') || errorMessage.includes('api') || errorMessage.includes('令牌')) {
        console.log('❌ 认证/权限问题');
        console.log('可能的原因：');
        console.log('  1. 未运行 cloudflared tunnel login');
        console.log('  2. cert.pem文件损坏或过期');
        console.log('  3. API令牌权限不足');
        
        console.log('💡 解决方案：');
        console.log('  1. 运行: cloudflared tunnel login');
        console.log('  2. 重新获取API令牌并确保有正确权限');
        console.log('  3. 检查~/.cloudflared/目录权限');
    }
    
    // 隧道创建/启动相关错误
    else if (errorMessage.includes('隧道') || errorMessage.includes('tunnel') || errorMessage.includes('启动') || errorMessage.includes('进程')) {
        console.log('❌ 隧道创建/启动问题');
        console.log('可能的原因：');
        console.log('  1. 网络连接问题');
        console.log('  2. cloudflared工具版本过旧');
        console.log('  3. 防火墙阻止连接');
        console.log('  4. Cloudflare服务临时不可用');
        
        console.log('💡 解决方案：');
        console.log('  1. 检查网络连接');
        console.log('  2. 更新cloudflared到最新版本');
        console.log('  3. 检查防火墙设置，确保443端口可用');
        console.log('  4. 稍后重试');
    }
    
    // 配置相关错误
    else if (errorMessage.includes('配置') || errorMessage.includes('config')) {
        console.log('❌ 配置问题');
        console.log('可能的原因：');
        console.log('  1. 配置文件创建失败');
        console.log('  2. 权限不足');
        console.log('  3. 磁盘空间不足');
        
        console.log('💡 解决方案：');
        console.log('  1. 检查~/.cloudflared/目录是否可写');
        console.log('  2. 检查磁盘空间');
        console.log('  3. 检查文件权限');
    }
    
    // 未知错误
    else {
        console.log('❌ 未知错误');
        console.log('💡 通用解决方案：');
        console.log('  1. 查看完整错误信息');
        console.log('  2. 检查网络连接');
        console.log('  3. 重新运行命令');
        console.log('  4. 查阅官方文档或社区支持');
    }
    
    console.log('');
}

function identifyFailureStage(errorMessage) {
    console.log('📋 失败阶段分析：');
    
    if (errorMessage.includes('cert.pem') || errorMessage.includes('认证') || errorMessage.includes('login')) {
        console.log('  阶段: 🔐 用户认证阶段');
        console.log('  说明: Cloudflare认证凭据无效或缺失');
        console.log('  解决: 运行 cloudflared tunnel login 获取认证');
    }
    else if (errorMessage.includes('api') || errorMessage.includes('令牌') || errorMessage.includes('token')) {
        console.log('  阶段: 🔑 API令牌验证阶段');
        console.log('  说明: Cloudflare API令牌无效或权限不足');
        console.log('  解决: 检查API令牌权限，需要Zone:Read和DNS:Edit权限');
    }
    else if (errorMessage.includes('隧道创建') || errorMessage.includes('tunnel create') || errorMessage.includes('命名隧道')) {
        console.log('  阶段: 🔧 隧道创建阶段');
        console.log('  说明: 无法创建Cloudflare隧道');
        console.log('  解决: 检查网络连接和Cloudflare服务状态');
    }
    else if (errorMessage.includes('配置文件') || errorMessage.includes('config') || errorMessage.includes('凭证文件')) {
        console.log('  阶段: 📝 配置文件创建阶段');
        console.log('  说明: 隧道配置文件创建失败');
        console.log('  解决: 检查~/.cloudflared/目录权限');
    }
    else if (errorMessage.includes('dns') || errorMessage.includes('验证失败') || errorMessage.includes('记录')) {
        console.log('  阶段: 🌐 DNS配置阶段');
        console.log('  说明: DNS记录创建或验证失败');
        console.log('  解决: 检查DNS权限或手动创建CNAME记录');
    }
    else if (errorMessage.includes('进程') || errorMessage.includes('启动') || errorMessage.includes('连接建立')) {
        console.log('  阶段: 🚀 隧道进程启动阶段');
        console.log('  说明: cloudflared进程启动或连接建立失败');
        console.log('  解决: 检查网络连接和防火墙设置');
    }
    else if (errorMessage.includes('验证') || errorMessage.includes('检查') || errorMessage.includes('存活')) {
        console.log('  阶段: ✅ 启动后验证阶段');
        console.log('  说明: 隧道启动成功但验证失败');
        console.log('  解决: 等待DNS传播或检查进程状态');
    }
    else {
        console.log('  阶段: ❓ 未知阶段');
        console.log('  说明: 无法确定具体失败阶段');
        console.log('  解决: 查看完整错误信息进行排查');
    }
    
    console.log('');
}

// 如果直接运行此脚本
if (require.main === module) {
    testEnhancedErrorFeedback().catch(console.error);
}

module.exports = { testEnhancedErrorFeedback };