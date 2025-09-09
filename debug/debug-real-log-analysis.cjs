#!/usr/bin/env node

/**
 * 分析用户提供的真实日志，找出问题所在
 */

console.log('🔍 分析真实日志中的关键信息...\n');

// 用户提供的实际日志
const userLog = `
✅ DNS路由重试成功
✅ DNS 冲突智能解决成功
✅ 命名隧道和 DNS 配置完成
✅ 隧道配置文件已创建: /home/yxhpy/.cloudflared/config.yml
执行命令: cloudflared tunnel run 2513e198-1013-4959-99cc-89e398bda9a3
[cloudflared] 2025-09-08T00:35:45Z INF Starting tunnel tunnelID=2513e198-1013-4959-99cc-89e398bda9a3
[cloudflared] 2025-09-08T00:35:45Z INF Version 2025.8.1 (Checksum a66353004197ee4c1fcb68549203824882bba62378ad4d00d234bdb8251f1114)
2025-09-08T00:35:45Z INF GOOS: linux, GOVersion: go1.24.4, GoArch: amd64
2025-09-08T00:35:45Z INF Settings: map[cred-file:/home/yxhpy/.cloudflared/2513e198-1013-4959-99cc-89e398bda9a3.json credentials-file:/home/yxhpy/.cloudflared/2513e198-1013-4959-99cc-89e398bda9a3.json]
[cloudflared] 2025-09-08T00:35:45Z INF cloudflared will not automatically update if installed by a package manager.
[cloudflared] 2025-09-08T00:35:45Z INF Generated Connector ID: bc02a2dd-96d6-485d-aeac-f9a098b410f8
[cloudflared] 2025-09-08T00:35:45Z INF Initial protocol quic
[cloudflared] 2025-09-08T00:35:45Z INF ICMP proxy will use 192.168.3.219 as source for IPv4
[cloudflared] 2025-09-08T00:35:45Z INF ICMP proxy will use fe80::20c:29ff:fe2d:f134 in zone ens33 as source for IPv6
[cloudflared] 2025-09-08T00:35:45Z WRN The user running cloudflared process has a GID (group ID) that is not within ping_group_range. You might need to add that user to a group within that range, or instead update the range to encompass a group the user is already in by modifying /proc/sys/net/ipv4/ping_group_range. Otherwise cloudflared will not be able to ping this network error="Group ID 1000 is not between ping group 1 to 0"
2025-09-08T00:35:45Z WRN ICMP proxy feature is disabled error="cannot create ICMPv4 proxy: Group ID 1000 is not between ping group 1 to 0 nor ICMPv6 proxy: socket: permission denied"
[cloudflared] 2025-09-08T00:35:45Z INF ICMP proxy will use 192.168.3.219 as source for IPv4
[cloudflared] 2025-09-08T00:35:45Z INF ICMP proxy will use fe80::20c:29ff:fe2d:f134 in zone ens33 as source for IPv6
[cloudflared] 2025-09-08T00:35:45Z INF Starting metrics server on 127.0.0.1:20241/metrics
[cloudflared] 2025-09-08T00:35:45Z INF Tunnel connection curve preferences: [X25519MLKEM768 CurveP256] connIndex=0 event=0 ip=198.41.192.57
[cloudflared] 2025/09/08 00:35:45 failed to sufficiently increase receive buffer size (was: 208 kiB, wanted: 7168 kiB, got: 416 kiB). See https://github.com/quic-go/quic-go/wiki/UDP-Buffer-Sizes for details.
[cloudflared] 2025-09-08T00:35:45Z INF Registered tunnel connection connIndex=0 connection=4a692918-df4a-4544-a4d8-91a7204df501 event=0 ip=198.41.192.57 location=sjc06 protocol=quic
[cloudflared] 2025-09-08T00:35:45Z INF Tunnel connection curve preferences: [X25519MLKEM768 CurveP256] connIndex=1 event=0 ip=198.41.200.53
[cloudflared] 2025-09-08T00:35:46Z INF Registered tunnel connection connIndex=1 connection=21931529-bd42-421b-8030-b925246c27ad event=0 ip=198.41.200.53 location=sjc08 protocol=quic
[cloudflared] 2025-09-08T00:35:46Z INF Tunnel connection curve preferences: [X25519MLKEM768 CurveP256] connIndex=2 event=0 ip=198.41.192.27
[cloudflared] 2025-09-08T00:35:47Z INF Registered tunnel connection connIndex=2 connection=be45984d-4c6e-4b8e-97b7-7cf64a8f76a6 event=0 ip=198.41.192.27 location=sjc06 protocol=quic
[cloudflared] 2025-09-08T00:35:47Z INF Tunnel connection curve preferences: [X25519MLKEM768 CurveP256] connIndex=3 event=0 ip=198.41.200.63
[cloudflared] 2025-09-08T00:35:48Z INF Registered tunnel connection connIndex=3 connection=e366c3f2-38c2-4fbb-9051-ac00207977b2 event=0 ip=198.41.200.63 location=sjc07 protocol=quic
❌ 认证后流程失败: 命名隧道启动超时
⏹️ 隧道健康检查已停止
Cloudflare Tunnel 隧道已关闭
🗑️  清理命名隧道: tunnel-gemini-yxhpy-xyz-1757291734957 已经运行成功了，后面会自动停止呢？
`;

// 1. 时间线分析
console.log('📅 时间线分析：');
const timeline = [
    '00:35:45 - 隧道启动',
    '00:35:45 - 第一个连接建立 (connIndex=0)',
    '00:35:46 - 第二个连接建立 (connIndex=1)', 
    '00:35:47 - 第三个连接建立 (connIndex=2)',
    '00:35:48 - 第四个连接建立 (connIndex=3)',
    '随后某个时间 - 报告"命名隧道启动超时"'
];

timeline.forEach(item => console.log(`  ${item}`));

console.log('\n🔍 关键发现：');
console.log('1. cloudflared 确实成功建立了4个连接');
console.log('2. 连接建立很快（3秒内完成）');
console.log('3. 所有日志都以 [cloudflared] 开头');
console.log('4. 成功连接的日志包含 "Registered tunnel connection"');

// 2. 检查日志格式的一致性
console.log('\n📋 日志格式分析：');

// 提取所有包含 "Registered tunnel connection" 的行
const registeredLines = userLog.split('\n').filter(line => 
    line.includes('Registered tunnel connection')
);

console.log(`找到 ${registeredLines.length} 行成功连接日志：`);
registeredLines.forEach((line, index) => {
    console.log(`${index + 1}. ${line.trim()}`);
    
    // 测试我们的检测逻辑
    const shouldMatch = line.includes('Registered tunnel connection') || 
                       line.includes('connection established') ||
                       (line.includes('INF') && line.includes('connection='));
    
    console.log(`   检测结果: ${shouldMatch ? '✅ 匹配' : '❌ 不匹配'}`);
});

// 3. 关键问题分析
console.log('\n🎯 关键问题分析：');

console.log('问题可能不在检测逻辑，而在以下几个方面：');
console.log();
console.log('1. 💡 输出流问题猜测：');
console.log('   - 注意到有些日志有 [cloudflared] 前缀，有些没有');
console.log('   - 可能不同类型的日志分别输出到 stdout 和 stderr');

// 分析日志前缀模式
const withPrefix = userLog.split('\n').filter(line => line.includes('[cloudflared]')).length;
const withoutPrefix = userLog.split('\n').filter(line => 
    line.includes('INF') && !line.includes('[cloudflared]')
).length;

console.log(`   有 [cloudflared] 前缀的日志: ${withPrefix} 行`);
console.log(`   无前缀但有 INF 的日志: ${withoutPrefix} 行`);

console.log('\n2. 🕐 时机问题猜测：');
console.log('   - 可能 safeResolve() 被调用了，但之后又有其他事件触发了 safeReject()');
console.log('   - 特别是 child.on("exit") 事件可能有问题');

console.log('\n3. 🔄 竞态条件猜测：');
console.log('   - 多个 "Registered tunnel connection" 日志可能导致多次调用 safeResolve()');
console.log('   - 虽然有 resolved 标记，但可能存在其他竞态条件');

// 4. 生成测试建议
console.log('\n🛠️ 具体修复建议：');
console.log();
console.log('1. 立即修复 - 增强日志记录：');
console.log('   在 waitForNamedTunnelStartup 中添加详细日志，确切知道发生了什么');

console.log('\n2. 可能的修复点 - 输出流：');
console.log('   检查是否需要同时监听 stderr，因为某些重要日志可能在那里');

console.log('\n3. 可能的修复点 - exit 事件处理：');
console.log('   检查 child.on("exit") 的逻辑是否正确');

console.log('\n🎯 建议先添加调试日志，然后运行一次实际测试来确定问题根因');