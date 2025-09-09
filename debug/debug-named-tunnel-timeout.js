#!/usr/bin/env node

/**
 * Debug脚本：命名隧道启动超时问题分析
 * 
 * 问题现象：
 * - 命名隧道成功建立连接（显示 "Registered tunnel connection" 4次）
 * - 但随后立即因"命名隧道启动超时"而关闭
 * 
 * 分析目标：
 * 1. 检查waitForNamedTunnelStartup()中的成功检测逻辑
 * 2. 分析实际日志输出与检测条件是否匹配
 * 3. 找出为什么resolve()没有被调用
 */

import chalk from 'chalk';

// 模拟从cloudflared输出中看到的实际日志
const actualLogs = [
    "2025-09-08T00:05:40Z INF Starting tunnel tunnelID=9e4b35ec-350a-4065-922d-088c5151cb66",
    "2025-09-08T00:05:40Z INF Version 2025.8.1 (Checksum a66353004197ee4c1fcb68549203824882bba62378ad4d00d234bdb8251f1114)",
    "2025-09-08T00:05:40Z INF GOOS: linux, GOVersion: go1.24.4, GoArch: amd64",
    "2025-09-08T00:05:40Z INF Settings: map[cred-file:/home/yxhpy/.cloudflared/9e4b35ec-350a-4065-922d-088c5151cb66.json credentials-file:/home/yxhpy/.cloudflared/9e4b35ec-350a-4065-922d-088c5151cb66.json]",
    "2025-09-08T00:05:40Z INF cloudflared will not automatically update if installed by a package manager.",
    "2025-09-08T00:05:40Z INF Generated Connector ID: 5a9e52d5-7391-423b-9b41-d50e51be895a",
    "2025-09-08T00:05:40Z INF Initial protocol quic",
    "2025-09-08T00:05:40Z INF ICMP proxy will use 192.168.3.219 as source for IPv4",
    "2025-09-08T00:05:40Z INF ICMP proxy will use fe80::20c:29ff:fe2d:f134 in zone ens33 as source for IPv6",
    "2025-09-08T00:05:40Z WRN The user running cloudflared process has a GID (group ID) that is not within ping_group_range...",
    "2025-09-08T00:05:40Z WRN ICMP proxy feature is disabled error=\"cannot create ICMPv4 proxy: Group ID 1000 is not between ping group 1 to 0 nor ICMPv6 proxy: socket: permission denied\"",
    "2025-09-08T00:05:40Z INF ICMP proxy will use 192.168.3.219 as source for IPv4",
    "2025-09-08T00:05:40Z INF ICMP proxy will use fe80::20c:29ff:fe2d:f134 in zone ens33 as source for IPv6",
    "2025-09-08T00:05:40Z INF Starting metrics server on 127.0.0.1:20241/metrics",
    "2025-09-08T00:05:40Z INF Tunnel connection curve preferences: [X25519MLKEM768 CurveP256] connIndex=0 event=0 ip=198.41.200.43",
    "2025/09/08 00:05:40 failed to sufficiently increase receive buffer size...",
    "2025-09-08T00:05:40Z INF Registered tunnel connection connIndex=0 connection=cda651c4-8ff1-49e8-97dc-5cfd6492a7cb event=0 ip=198.41.200.43 location=sjc07 protocol=quic",
    "2025-09-08T00:05:40Z INF Tunnel connection curve preferences: [X25519MLKEM768 CurveP256] connIndex=1 event=0 ip=198.41.192.227",
    "2025-09-08T00:05:41Z INF Registered tunnel connection connIndex=1 connection=221e1300-770e-42de-a420-1167356a3fab event=0 ip=198.41.192.227 location=sjc06 protocol=quic",
    "2025-09-08T00:05:41Z INF Tunnel connection curve preferences: [X25519MLKEM768 CurveP256] connIndex=2 event=0 ip=198.41.192.57",
    "2025-09-08T00:05:42Z INF Registered tunnel connection connIndex=2 connection=04d90f0d-e8eb-4918-a9ec-e8d4aee8b68b event=0 ip=198.41.192.57 location=sjc01 protocol=quic",
    "2025-09-08T00:05:42Z INF Tunnel connection curve preferences: [X25519MLKEM768 CurveP256] connIndex=3 event=0 ip=198.41.200.23",
    "2025-09-08T00:05:43Z INF Registered tunnel connection connIndex=3 connection=44b9d988-cdee-4949-8dcf-6e519dd38778 event=0 ip=198.41.200.23 location=sjc08 protocol=quic"
];

console.log(chalk.blue('🔍 分析命名隧道启动超时问题'));
console.log(chalk.blue('=' .repeat(60)));

// 当前的检测条件（来自 src/providers/cloudflare.js:1340-1342）
function currentDetection(text) {
    return text.includes('Registered tunnel connection') || 
           text.includes('connection established') ||
           (text.includes('INF') && text.includes('connection='));
}

console.log(chalk.yellow('\n📋 当前的成功检测条件：'));
console.log('1. text.includes("Registered tunnel connection")');
console.log('2. text.includes("connection established")');
console.log('3. text.includes("INF") && text.includes("connection=")');

console.log(chalk.yellow('\n🧪 测试实际日志行：'));
let shouldHaveResolved = false;
let resolveCount = 0;

actualLogs.forEach((log, index) => {
    const matches = currentDetection(log);
    if (matches) {
        console.log(chalk.green(`✅ [${index}] 匹配成功: ${log}`));
        resolveCount++;
        shouldHaveResolved = true;
    } else if (log.includes('Registered tunnel connection') || log.includes('connection=')) {
        console.log(chalk.yellow(`⚠️  [${index}] 应该匹配但未匹配: ${log}`));
    } else {
        console.log(chalk.gray(`   [${index}] 不匹配: ${log.substring(0, 80)}...`));
    }
});

console.log(chalk.yellow('\n📊 分析结果：'));
console.log(`- 应该触发resolve的次数: ${resolveCount}`);
console.log(`- 隧道是否应该成功启动: ${shouldHaveResolved ? 'YES' : 'NO'}`);

if (resolveCount > 0) {
    console.log(chalk.red('\n❌ 问题诊断：'));
    console.log('尽管有日志匹配成功条件，但隧道仍然超时。');
    console.log('可能的原因：');
    console.log('1. 在第一个匹配后，还有其他代码逻辑导致进程退出');
    console.log('2. 匹配逻辑在实际代码中有bug');
    console.log('3. 存在竞态条件，timeout在resolve前触发');
    console.log('4. 子进程意外退出触发了reject');
    
    console.log(chalk.blue('\n🔧 需要检查的代码位置：'));
    console.log('- src/providers/cloudflare.js:1322-1375 (waitForNamedTunnelStartup方法)');
    console.log('- 子进程exit事件处理逻辑');
    console.log('- 是否有其他地方终止了cloudflared进程');
} else {
    console.log(chalk.red('\n❌ 问题诊断：'));
    console.log('没有日志匹配成功条件，检测逻辑需要修复。');
}

console.log(chalk.blue('\n🎯 建议的修复方案：'));
console.log('1. 增强日志匹配的鲁棒性');
console.log('2. 添加更详细的调试日志');
console.log('3. 检查是否有其他地方杀死了进程');
console.log('4. 考虑增加多个成功信号的计数，确保隧道真正稳定');