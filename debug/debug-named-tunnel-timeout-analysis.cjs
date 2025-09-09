#!/usr/bin/env node

/**
 * 调试命名隧道启动超时问题
 * 
 * 问题现象：
 * - cloudflared 成功建立4个连接到 Cloudflare
 * - 但我们的代码仍然报告"命名隧道启动超时"
 * 
 * 目标：分析 waitForNamedTunnelStartup 方法的逻辑问题
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 开始分析命名隧道启动超时问题...\n');

// 1. 分析问题日志
console.log('📋 问题日志分析:');
const problemLog = `
[cloudflared] 2025-09-08T00:35:45Z INF Registered tunnel connection connIndex=0 connection=4a692918-df4a-4544-a4d8-91a7204df501 event=0 ip=198.41.192.57 location=sjc06 protocol=quic
[cloudflared] 2025-09-08T00:35:46Z INF Registered tunnel connection connIndex=1 connection=21931529-bd42-421b-8030-b925246c27ad event=0 ip=198.41.200.53 location=sjc08 protocol=quic
[cloudflared] 2025-09-08T00:35:47Z INF Registered tunnel connection connIndex=2 connection=be45984d-4c6e-4b8e-97b7-7cf64a8f76a6 event=0 ip=198.41.192.27 location=sjc06 protocol=quic
[cloudflared] 2025-09-08T00:35:48Z INF Registered tunnel connection connIndex=3 connection=e366c3f2-38c2-4fbb-9051-ac00207977b2 event=0 ip=198.41.200.63 location=sjc07 protocol=quic
❌ 认证后流程失败: 命名隧道启动超时
`;

console.log(problemLog);
console.log('✅ 发现：cloudflared 已成功建立4个连接');
console.log('❌ 问题：我们的代码仍报告超时\n');

// 2. 读取 cloudflare.js 文件分析 waitForNamedTunnelStartup 方法
const cloudflareFilePath = path.join(__dirname, 'src/providers/cloudflare.js');

if (!fs.existsSync(cloudflareFilePath)) {
    console.log('❌ 找不到 cloudflare.js 文件');
    process.exit(1);
}

const cloudflareContent = fs.readFileSync(cloudflareFilePath, 'utf8');

// 3. 查找 waitForNamedTunnelStartup 方法
const methodMatch = cloudflareContent.match(/waitForNamedTunnelStartup\s*\([^{]*\)\s*{[^}]*}/);

if (!methodMatch) {
    console.log('❌ 找不到 waitForNamedTunnelStartup 方法');
    process.exit(1);
}

console.log('🔍 找到 waitForNamedTunnelStartup 方法：');
console.log('=' .repeat(80));

// 查找完整的方法定义（包括嵌套大括号）
let methodStart = cloudflareContent.indexOf('waitForNamedTunnelStartup');
if (methodStart === -1) {
    console.log('❌ 找不到 waitForNamedTunnelStartup 方法');
    process.exit(1);
}

// 向前查找到方法定义开始
while (methodStart > 0 && cloudflareContent[methodStart] !== '\n') {
    methodStart--;
}
methodStart++; // 跳过换行符

// 查找方法结束位置
let braceCount = 0;
let inMethod = false;
let methodEnd = methodStart;

for (let i = methodStart; i < cloudflareContent.length; i++) {
    const char = cloudflareContent[i];
    
    if (char === '{') {
        braceCount++;
        inMethod = true;
    } else if (char === '}') {
        braceCount--;
        if (inMethod && braceCount === 0) {
            methodEnd = i + 1;
            break;
        }
    }
}

const methodCode = cloudflareContent.substring(methodStart, methodEnd);
console.log(methodCode);
console.log('=' .repeat(80));

// 4. 分析成功连接的日志格式
console.log('\n🔍 分析成功连接的日志模式：');
const connectionPattern = /Registered tunnel connection connIndex=(\d+) connection=([a-f0-9-]+)/g;
const connections = [];
let match;

while ((match = connectionPattern.exec(problemLog)) !== null) {
    connections.push({
        index: match[1],
        id: match[2]
    });
}

console.log(`✅ 找到 ${connections.length} 个成功连接：`);
connections.forEach(conn => {
    console.log(`   connIndex=${conn.index}, connection=${conn.id}`);
});

// 5. 检查当前代码中的成功匹配模式
console.log('\n🔍 检查代码中的成功匹配逻辑：');

// 查找成功匹配的正则表达式或字符串匹配
const successPatterns = [
    /connection.*established/gi,
    /tunnel.*ready/gi,
    /registered.*tunnel.*connection/gi,
    /starting.*tunnel/gi,
    /tunnel.*running/gi
];

console.log('当前可能的成功匹配模式：');
successPatterns.forEach((pattern, index) => {
    console.log(`${index + 1}. ${pattern}`);
    const matches = methodCode.match(pattern);
    if (matches) {
        console.log(`   ✅ 在代码中找到匹配: ${matches[0]}`);
    } else {
        console.log(`   ❌ 在代码中未找到匹配`);
    }
});

// 6. 分析实际成功日志应该匹配的模式
console.log('\n💡 建议的成功匹配模式：');
console.log('根据实际日志，应该匹配以下模式之一：');
console.log('1. /Registered tunnel connection/i');
console.log('2. /connIndex=\\d+.*connection=[a-f0-9-]+/i');
console.log('3. /tunnel connection.*registered/i');

// 7. 检查超时设置
console.log('\n⏱️ 检查超时设置：');
const timeoutMatches = methodCode.match(/timeout[^=]*=\s*(\d+)/gi);
if (timeoutMatches) {
    console.log('找到的超时设置：', timeoutMatches);
} else {
    console.log('未找到明确的超时设置');
}

// 8. 生成修复建议
console.log('\n🛠️ 修复建议：');
console.log('1. 修改成功检测模式为: /Registered tunnel connection/i');
console.log('2. 确保在检测到成功连接后立即清除超时计时器');
console.log('3. 添加调试日志来跟踪检测过程');
console.log('4. 考虑等待至少1个连接建立即可认为成功');

console.log('\n🎯 下一步：创建测试脚本验证修复效果');