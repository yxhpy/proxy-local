#!/usr/bin/env node

/**
 * Debug文件: 分析Cloudflare隧道代理连接问题
 * 
 * 问题描述:
 * - DNS记录验证成功: gemini.yxhpy.xyz -> 1391297d-6bad-4306-9516-6718894c76ca.cfargotunnel.com
 * - 但隧道地址无法访问，疑似代理未成功启动或启动后退出
 * 
 * 分析步骤:
 * 1. 检查隧道ID和配置是否正确
 * 2. 检查cloudflared进程状态
 * 3. 检查隧道连接日志
 * 4. 测试隧道地址访问性
 */

const { spawn, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const TUNNEL_ID = '1391297d-6bad-4306-9516-6718894c76ca';
const DOMAIN = 'gemini.yxhpy.xyz';
const TUNNEL_URL = `${TUNNEL_ID}.cfargotunnel.com`;

async function debugTunnelConnection() {
    console.log('🔍 开始调试Cloudflare隧道代理连接问题...\n');
    
    try {
        // 1. 检查cloudflared进程状态
        console.log('1. 检查cloudflared进程状态:');
        try {
            const { stdout: processes } = await execAsync('ps aux | grep cloudflared | grep -v grep');
            console.log('✅ 找到cloudflared进程:');
            console.log(processes);
        } catch (error) {
            console.log('❌ 未找到活跃的cloudflared进程');
        }
        
        // 2. 检查隧道状态
        console.log('\n2. 检查隧道状态:');
        try {
            const { stdout: tunnelList } = await execAsync('cloudflared tunnel list');
            console.log('隧道列表:');
            console.log(tunnelList);
            
            if (tunnelList.includes(TUNNEL_ID)) {
                console.log(`✅ 找到隧道 ${TUNNEL_ID}`);
            } else {
                console.log(`❌ 未找到隧道 ${TUNNEL_ID}`);
            }
        } catch (error) {
            console.log('❌ 检查隧道状态失败:', error.message);
        }
        
        // 3. 尝试测试隧道连接
        console.log('\n3. 测试隧道地址连接:');
        try {
            const { stdout: curlResult } = await execAsync(`curl -I -m 10 https://${TUNNEL_URL}`, { timeout: 15000 });
            console.log('✅ 隧道地址响应:');
            console.log(curlResult);
        } catch (error) {
            console.log('❌ 隧道地址无法访问:', error.message);
        }
        
        // 4. 检查DNS解析
        console.log('\n4. 检查DNS解析:');
        try {
            const { stdout: digResult } = await execAsync(`dig ${DOMAIN} CNAME +short`);
            console.log(`${DOMAIN} CNAME记录:`);
            console.log(digResult.trim());
        } catch (error) {
            console.log('❌ DNS解析失败:', error.message);
        }
        
        // 5. 检查隧道配置文件
        console.log('\n5. 检查隧道配置:');
        try {
            const { stdout: configInfo } = await execAsync(`cloudflared tunnel info ${TUNNEL_ID}`);
            console.log('隧道配置信息:');
            console.log(configInfo);
        } catch (error) {
            console.log('❌ 获取隧道配置失败:', error.message);
        }
        
        // 6. 检查可能的错误日志
        console.log('\n6. 检查系统日志中的cloudflared错误:');
        try {
            const { stdout: systemLogs } = await execAsync('journalctl -u cloudflared --no-pager -n 50', { timeout: 10000 });
            console.log('系统服务日志:');
            console.log(systemLogs);
        } catch (error) {
            console.log('❌ 系统日志检查失败:', error.message);
        }
        
        console.log('\n🔍 调试分析完成');
        console.log('\n📋 问题可能的原因:');
        console.log('1. cloudflared进程未启动或已退出');
        console.log('2. 隧道配置错误或过期');
        console.log('3. 网络连接问题导致隧道无法建立');
        console.log('4. Cloudflare服务端问题');
        
    } catch (error) {
        console.error('❌ 调试过程中发生错误:', error);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    debugTunnelConnection();
}

module.exports = { debugTunnelConnection };