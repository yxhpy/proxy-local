#!/usr/bin/env node

const { CloudflareDomainManager } = require('./src/utils/cloudflare-domain-manager.js');
const chalk = require('chalk');

async function debugDnsRecordCreation() {
    console.log('🔍 DEBUG: DNS记录创建测试');
    
    const domain = 'gemini.yxhpy.xyz';
    const tunnelId = 'd4a3f36b-0cd7-4cb9-a200-4b4398c94cf2';
    const cnameTarget = `${tunnelId}.cfargotunnel.com`;
    
    console.log(`\n📝 测试参数:`);
    console.log(`域名: ${domain}`);
    console.log(`隧道ID: ${tunnelId}`);
    console.log(`CNAME目标: ${cnameTarget}`);
    
    const domainManager = new CloudflareDomainManager();
    
    try {
        // 1. 检查API令牌
        console.log('\n🔑 检查API令牌...');
        const hasToken = await domainManager.isAuthenticated();
        console.log(`API令牌可用: ${hasToken}`);
        
        if (!hasToken) {
            console.log('❌ 缺少API令牌，无法继续');
            return;
        }
        
        // 2. 获取Zone ID
        console.log('\n🌐 获取Zone ID...');
        const zoneId = await domainManager.getZoneId(domain);
        console.log(`Zone ID: ${zoneId || '未找到'}`);
        
        if (!zoneId) {
            console.log('❌ 无法获取Zone ID，检查域名是否在Cloudflare管理');
            return;
        }
        
        // 3. 查询现有DNS记录
        console.log('\n🔍 查询现有DNS记录...');
        const existingRecords = await domainManager.queryDnsRecords(domain);
        console.log(`找到 ${existingRecords.records.length} 条记录:`);
        existingRecords.records.forEach((record, i) => {
            console.log(`  ${i+1}. ${record.type} ${record.name} -> ${record.content} (ID: ${record.id})`);
        });
        
        // 4. 尝试创建CNAME记录
        console.log('\n➕ 尝试创建CNAME记录...');
        const result = await domainManager.upsertDnsRecord(domain, cnameTarget, {
            type: 'CNAME',
            ttl: 300,
            proxied: false,
            comment: `Created by debug script for tunnel ${tunnelId}`
        });
        
        console.log('\n✅ DNS记录操作结果:');
        console.log(`操作类型: ${result.action}`);
        console.log(`消息: ${result.message}`);
        if (result.record) {
            console.log(`记录ID: ${result.record.id}`);
            console.log(`记录内容: ${result.record.type} ${result.record.name} -> ${result.record.content}`);
        }
        
        // 5. 验证DNS记录
        console.log('\n🔍 验证DNS记录创建...');
        const updatedRecords = await domainManager.queryDnsRecords(domain);
        console.log(`验证结果 - 找到 ${updatedRecords.records.length} 条记录:`);
        updatedRecords.records.forEach((record, i) => {
            console.log(`  ${i+1}. ${record.type} ${record.name} -> ${record.content}`);
        });
        
    } catch (error) {
        console.log(chalk.red(`❌ 测试过程出错: ${error.message}`));
        console.log(chalk.gray(`堆栈: ${error.stack}`));
    }
}

debugDnsRecordCreation();