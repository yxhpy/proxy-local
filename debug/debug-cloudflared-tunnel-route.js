#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🔍 DEBUG: Cloudflared隧道路由配置分析');

// 1. 检查隧道ID和凭据文件
const tunnelId = 'd4a3f36b-0cd7-4cb9-a200-4b4398c94cf2';
const credFile = `/home/yxhpy/.cloudflared/${tunnelId}.json`;

console.log(`\n📁 凭据文件路径: ${credFile}`);
console.log(`📁 凭据文件存在: ${fs.existsSync(credFile)}`);

if (fs.existsSync(credFile)) {
    try {
        const credContent = JSON.parse(fs.readFileSync(credFile, 'utf8'));
        console.log(`🔑 AccountTag: ${credContent.AccountTag}`);
        console.log(`🔑 TunnelSecret存在: ${!!credContent.TunnelSecret}`);
    } catch (e) {
        console.log('❌ 凭据文件解析失败:', e.message);
    }
}

// 2. 检查cloudflared配置文件
const configPath = '/home/yxhpy/.cloudflared/config.yml';
console.log(`\n📄 配置文件路径: ${configPath}`);
console.log(`📄 配置文件存在: ${fs.existsSync(configPath)}`);

if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    console.log('\n📄 配置文件内容:');
    console.log('---');
    console.log(configContent);
    console.log('---');
}

// 3. 获取隧道路由信息
console.log('\n🌐 获取隧道路由信息...');
const routeCmd = spawn('cloudflared', ['tunnel', 'route', 'dns', tunnelId], {
    stdio: ['pipe', 'pipe', 'pipe']
});

let routeOutput = '';
let routeError = '';

routeCmd.stdout.on('data', (data) => {
    routeOutput += data.toString();
});

routeCmd.stderr.on('data', (data) => {
    routeError += data.toString();
});

routeCmd.on('close', (code) => {
    console.log(`\n🔍 Route命令退出码: ${code}`);
    if (routeOutput) {
        console.log('📋 Route输出:');
        console.log(routeOutput);
    }
    if (routeError) {
        console.log('❌ Route错误:');
        console.log(routeError);
    }

    // 4. 检查隧道信息
    console.log('\n🔍 获取隧道详细信息...');
    const infoCmd = spawn('cloudflared', ['tunnel', 'info', tunnelId], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let infoOutput = '';
    let infoError = '';

    infoCmd.stdout.on('data', (data) => {
        infoOutput += data.toString();
    });

    infoCmd.stderr.on('data', (data) => {
        infoError += data.toString();
    });

    infoCmd.on('close', (code) => {
        console.log(`\n🔍 Info命令退出码: ${code}`);
        if (infoOutput) {
            console.log('📋 隧道信息:');
            console.log(infoOutput);
        }
        if (infoError) {
            console.log('❌ Info错误:');
            console.log(infoError);
        }

        // 5. 检查DNS记录
        console.log('\n🌐 检查DNS记录...');
        const dnsCmd = spawn('nslookup', ['gemini.yxhpy.xyz'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let dnsOutput = '';
        let dnsError = '';

        dnsCmd.stdout.on('data', (data) => {
            dnsOutput += data.toString();
        });

        dnsCmd.stderr.on('data', (data) => {
            dnsError += data.toString();
        });

        dnsCmd.on('close', (code) => {
            console.log(`\n🔍 DNS查询退出码: ${code}`);
            if (dnsOutput) {
                console.log('📋 DNS查询结果:');
                console.log(dnsOutput);
            }
            if (dnsError) {
                console.log('❌ DNS查询错误:');
                console.log(dnsError);
            }

            console.log('\n🔍 分析完成，请检查以上信息来确定问题所在');
            console.log('\n可能的问题:');
            console.log('1. DNS记录未正确设置或传播');
            console.log('2. 隧道路由配置缺失');
            console.log('3. 隧道配置文件问题');
        });
    });
});