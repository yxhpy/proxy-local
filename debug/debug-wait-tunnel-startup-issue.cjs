#!/usr/bin/env node

/**
 * 调试 waitForNamedTunnelStartup 方法的具体问题
 * 
 * 分析从实际代码中找到的问题
 */

console.log('🔍 分析 waitForNamedTunnelStartup 方法的逻辑问题...\n');

// 1. 从实际日志分析成功信号
const actualLog = `[cloudflared] 2025-09-08T00:35:45Z INF Registered tunnel connection connIndex=0 connection=4a692918-df4a-4544-a4d8-91a7204df501 event=0 ip=198.41.192.57 location=sjc06 protocol=quic`;

console.log('📋 实际成功日志格式：');
console.log(actualLog);
console.log();

// 2. 分析当前代码的检测逻辑
console.log('🔍 当前代码的检测逻辑（第1365-1369行）：');
console.log(`
if (text.includes('Registered tunnel connection') || 
    text.includes('connection established') ||
    (text.includes('INF') && text.includes('connection='))) {
  safeResolve();
}
`);

// 3. 模拟检测过程
console.log('🧪 模拟检测过程：');

function testDetection(logLine, description) {
    console.log(`\n测试: ${description}`);
    console.log(`日志: ${logLine}`);
    
    const condition1 = logLine.includes('Registered tunnel connection');
    const condition2 = logLine.includes('connection established');
    const condition3 = logLine.includes('INF') && logLine.includes('connection=');
    
    console.log(`  condition1 (Registered tunnel connection): ${condition1}`);
    console.log(`  condition2 (connection established): ${condition2}`);
    console.log(`  condition3 (INF && connection=): ${condition3}`);
    
    const shouldResolve = condition1 || condition2 || condition3;
    console.log(`  结果: ${shouldResolve ? '✅ 应该成功' : '❌ 不会成功'}`);
    
    return shouldResolve;
}

// 测试各种日志格式
testDetection(actualLog, '实际成功日志');

testDetection(
    '[cloudflared] 2025-09-08T00:35:45Z INF Starting tunnel tunnelID=2513e198-1013-4959-99cc-89e398bda9a3',
    '隧道启动日志'
);

testDetection(
    '[cloudflared] 2025-09-08T00:35:45Z INF Generated Connector ID: bc02a2dd-96d6-485d-aeac-f9a098b410f8',
    '连接器生成日志'
);

// 4. 分析潜在问题
console.log('\n🔍 潜在问题分析：');

// 检查 stdout vs stderr 问题
console.log('1. 输出流问题：');
console.log('   - 当前代码监听 child.stdout');
console.log('   - 需要确认 cloudflared 的连接信息是否输出到 stdout');
console.log('   - 可能需要同时监听 stderr');

// 检查时机问题
console.log('\n2. 时机问题：');
console.log('   - 超时时间：60秒');
console.log('   - 从日志看，连接建立时间：');
console.log('     * connIndex=0: 00:35:45');
console.log('     * connIndex=1: 00:35:46'); 
console.log('     * connIndex=2: 00:35:47');
console.log('     * connIndex=3: 00:35:48');
console.log('   - 建立连接只用了3秒，应该不是超时问题');

// 检查条件匹配问题
console.log('\n3. 条件匹配分析：');
console.log('   实际日志包含：');
console.log('   - ✅ "Registered tunnel connection" - 应该匹配condition1');
console.log('   - ✅ "INF" - condition3第一部分匹配');
console.log('   - ✅ "connection=" - condition3第二部分匹配');
console.log('   - ❌ "connection established" - condition2不匹配');

console.log('\n🤔 理论上应该匹配成功，但实际失败了...');

// 5. 生成假设
console.log('\n💡 可能的问题假设：');
console.log('1. 竞态条件：safeResolve() 被调用了，但后续某个地方又触发了 safeReject()');
console.log('2. 输出流问题：连接信息可能输出到stderr而不是stdout');
console.log('3. 字符编码问题：text.toString() 可能有编码问题');
console.log('4. 子进程退出事件：child.on("exit") 可能在成功后仍然触发');
console.log('5. 多次resolve：虽然有resolved检查，但逻辑可能有问题');

console.log('\n🛠️ 下一步：创建真实测试来验证这些假设');