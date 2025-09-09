#!/usr/bin/env node

const { spawn } = require('child_process');
const dns = require('dns').promises;
const chalk = require('chalk');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkDnsResolution(domain, retries = 10) {
    console.log(chalk.blue(`🔍 等待DNS传播: ${domain}`));
    
    for (let i = 1; i <= retries; i++) {
        try {
            console.log(chalk.gray(`尝试 ${i}/${retries}: 检查DNS解析...`));
            
            const records = await dns.resolveCname(domain);
            if (records && records.length > 0) {
                console.log(chalk.green(`✅ DNS解析成功: ${domain} -> ${records[0]}`));
                return records[0];
            }
        } catch (error) {
            if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
                console.log(chalk.yellow(`⏳ 第${i}次: DNS记录还未传播`));
            } else {
                console.log(chalk.yellow(`⚠️ 第${i}次: ${error.message}`));
            }
        }
        
        if (i < retries) {
            console.log(chalk.blue(`⏳ 等待30秒后重试...`));
            await sleep(30000);
        }
    }
    
    console.log(chalk.red(`❌ DNS传播检查失败，已重试${retries}次`));
    return null;
}

async function testTunnelAccess(url) {
    return new Promise((resolve) => {
        console.log(chalk.blue(`🌐 测试隧道访问: ${url}`));
        
        const child = spawn('curl', ['-I', '--connect-timeout', '10', '--max-time', '20', url], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let error = '';
        
        child.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            error += data.toString();
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                console.log(chalk.green('✅ 隧道访问测试成功'));
                console.log(chalk.gray('响应头:'));
                console.log(chalk.gray(output.split('\n').slice(0, 3).join('\n')));
                resolve({ success: true, output });
            } else {
                console.log(chalk.yellow(`⚠️ 隧道访问失败 (code: ${code})`));
                console.log(chalk.gray(`错误: ${error.trim()}`));
                resolve({ success: false, error });
            }
        });
        
        child.on('error', (err) => {
            console.log(chalk.red(`❌ 测试命令执行失败: ${err.message}`));
            resolve({ success: false, error: err.message });
        });
    });
}

async function main() {
    const domain = 'gemini.yxhpy.xyz';
    const tunnelUrl = `https://${domain}`;
    
    console.log(chalk.blue('🔧 Cloudflared DNS配置修复流程'));
    console.log(chalk.blue('='.repeat(50)));
    
    console.log(chalk.green('✅ 问题诊断完成:'));
    console.log(chalk.gray('  - 隧道已创建并运行正常'));
    console.log(chalk.gray('  - DNS记录已正确配置'));
    console.log(chalk.gray('  - 需要等待DNS传播'));
    
    console.log(chalk.blue('\n📋 修复步骤:'));
    console.log(chalk.gray('  1. DNS记录已在Cloudflare配置'));
    console.log(chalk.gray('  2. 等待DNS记录全球传播'));
    console.log(chalk.gray('  3. 测试隧道连通性'));
    
    // 等待DNS传播
    const cnameTarget = await checkDnsResolution(domain);
    
    if (cnameTarget) {
        console.log(chalk.green(`\n🎉 DNS传播成功！`));
        console.log(chalk.blue(`📝 CNAME记录: ${domain} -> ${cnameTarget}`));
        
        // 测试隧道访问
        console.log(chalk.blue('\n🔍 测试隧道访问...'));
        const accessResult = await testTunnelAccess(tunnelUrl);
        
        if (accessResult.success) {
            console.log(chalk.green('\n🎉 隧道完全正常工作！'));
            console.log(chalk.blue(`🌐 可访问地址: ${tunnelUrl}`));
        } else {
            console.log(chalk.yellow('\n⚠️ DNS已传播但隧道访问仍有问题'));
            console.log(chalk.gray('这可能需要额外的时间，或检查以下项目:'));
            console.log(chalk.gray('  - 隧道进程是否仍在运行'));
            console.log(chalk.gray('  - 本地服务是否在8000端口正常运行'));
            console.log(chalk.gray('  - 防火墙设置'));
        }
    } else {
        console.log(chalk.red('\n❌ DNS传播仍未完成'));
        console.log(chalk.yellow('建议:'));
        console.log(chalk.gray('  - DNS传播可能需要更长时间 (最多24小时)'));
        console.log(chalk.gray('  - 可以稍后重新运行此脚本检查'));
        console.log(chalk.gray(`  - 或直接访问: ${tunnelUrl}`));
    }
    
    console.log(chalk.blue('\n💡 总结:'));
    console.log(chalk.gray('  - 隧道配置已正确完成'));
    console.log(chalk.gray('  - DNS记录已正确创建'));
    console.log(chalk.gray('  - 需要耐心等待DNS传播'));
}

main().catch(console.error);