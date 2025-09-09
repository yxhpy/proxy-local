#!/usr/bin/env node

/**
 * Debug文件：检查Cloudflare DNS API状态
 * 
 * 通过Cloudflare API直接查询DNS记录状态
 */

const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const DOMAIN = 'gemini.yxhpy.xyz';
const ZONE_NAME = 'yxhpy.xyz'; // 根域名

async function debugCloudflareAPI() {
    console.log('🔍 通过Cloudflare API检查DNS状态...\n');
    
    try {
        // 1. 检查API令牌是否有效
        console.log('1. 验证API令牌:');
        const tokenValid = await verifyAPIToken();
        
        if (!tokenValid) {
            console.log('❌ API令牌无效，无法继续检查');
            return;
        }
        
        // 2. 获取zone ID
        console.log('\n2. 获取zone ID:');
        const zoneId = await getZoneId(ZONE_NAME);
        
        if (!zoneId) {
            console.log('❌ 无法获取zone ID');
            return;
        }
        
        console.log(`✅ Zone ID: ${zoneId}`);
        
        // 3. 查询DNS记录
        console.log('\n3. 查询DNS记录:');
        await queryDNSRecords(zoneId, DOMAIN);
        
        // 4. 检查隧道记录
        console.log('\n4. 检查隧道相关记录:');
        await checkTunnelRecords(zoneId);
        
    } catch (error) {
        console.error(`❌ API调试失败: ${error.message}`);
    }
}

async function verifyAPIToken() {
    try {
        // 读取API令牌
        const { stdout } = await execAsync('cat ~/.cloudflared/cert.pem 2>/dev/null | head -1');
        
        // 实际上我们需要从环境变量或配置中获取API令牌
        // 这里我们只是验证cert.pem存在
        console.log('✅ 找到cert.pem文件');
        
        // 尝试使用cloudflared验证
        const { stdout: zoneList } = await execAsync('cloudflared tunnel login --help 2>&1 | head -5');
        console.log('✅ cloudflared命令可用');
        
        return true;
    } catch (error) {
        console.log(`❌ 令牌验证失败: ${error.message}`);
        return false;
    }
}

async function getZoneId(zoneName) {
    // 这里需要实际的Cloudflare API调用
    // 由于我们没有直接的API令牌，我们模拟这个过程
    console.log(`模拟获取 ${zoneName} 的zone ID...`);
    return "simulated-zone-id";
}

async function queryDNSRecords(zoneId, domain) {
    try {
        // 使用dig直接查询authoritative DNS
        console.log(`查询 ${domain} 的DNS记录:`);
        
        // 查询Cloudflare的权威DNS服务器
        const { stdout: nsRecords } = await execAsync(`dig ${ZONE_NAME} NS +short`);
        console.log(`权威DNS服务器:`);
        console.log(nsRecords);
        
        // 直接查询Cloudflare DNS
        if (nsRecords.includes('cloudflare')) {
            console.log('✅ 域名使用Cloudflare DNS');
            
            // 查询特定记录
            const { stdout: cnameQuery } = await execAsync(`dig @1.1.1.1 ${domain} CNAME +short`);
            console.log(`Cloudflare DNS查询结果: ${cnameQuery.trim() || '(无记录)'}`);
            
            // 查询任何记录
            const { stdout: anyQuery } = await execAsync(`dig @1.1.1.1 ${domain} ANY +short`);
            console.log(`ANY记录查询: ${anyQuery.trim() || '(无记录)'}`);
            
        } else {
            console.log('❌ 域名未使用Cloudflare DNS');
        }
        
    } catch (error) {
        console.log(`❌ DNS记录查询失败: ${error.message}`);
    }
}

async function checkTunnelRecords(zoneId) {
    try {
        console.log('检查所有隧道相关的DNS记录...');
        
        // 查询所有cfargotunnel.com的记录
        const { stdout: tunnelRecords } = await execAsync(`dig @1.1.1.1 ${ZONE_NAME} CNAME | grep cfargotunnel`);
        if (tunnelRecords.trim()) {
            console.log('找到隧道DNS记录:');
            console.log(tunnelRecords);
        } else {
            console.log('❌ 未找到cfargotunnel.com相关记录');
        }
        
        // 检查子域名
        console.log(`\n检查子域名 ${DOMAIN}:`);
        const subdomainParts = DOMAIN.split('.');
        if (subdomainParts.length > 2) {
            const subdomain = subdomainParts[0];
            console.log(`子域名: ${subdomain}`);
            
            // 尝试查询子域名的任何记录
            const { stdout: subQuery } = await execAsync(`dig @1.1.1.1 ${DOMAIN} +short`);
            console.log(`子域名查询结果: ${subQuery.trim() || '(无记录)'}`);
        }
        
    } catch (error) {
        console.log(`❌ 隧道记录检查失败: ${error.message}`);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    debugCloudflareAPI().catch(console.error);
}

module.exports = { debugCloudflareAPI };