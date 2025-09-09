#!/usr/bin/env node

/**
 * 测试 cloudflared 的实际输出流，找出我们错过的信息
 * 
 * 这个脚本会启动一个真实的 cloudflared 命名隧道进程，
 * 并详细记录 stdout 和 stderr 的所有输出
 */

const { spawn } = require('child_process');
const fs = require('fs');

console.log('🧪 测试 cloudflared 命名隧道的输出流...\n');

// 检查是否有 cloudflared
const { execSync } = require('child_process');
try {
    execSync('which cloudflared', { stdio: 'ignore' });
} catch {
    console.log('❌ 未找到 cloudflared 命令，请先安装');
    process.exit(1);
}

// 检查认证
const os = require('os');
const path = require('path');
const certPath = path.join(os.homedir(), '.cloudflared', 'cert.pem');

if (!fs.existsSync(certPath)) {
    console.log('❌ 未找到 cloudflare 认证文件，请先运行 cloudflared tunnel login');
    process.exit(1);
}

console.log('✅ 找到 cloudflared 和认证文件');

// 创建测试用的隧道配置
const testTunnelName = `test-debug-tunnel-${Date.now()}`;
const testDomain = 'test.yxhpy.xyz'; // 假设域名

console.log(`📝 创建测试隧道: ${testTunnelName}`);

// 模拟我们实际代码中的启动过程
function testTunnelStartup() {
    return new Promise((resolve, reject) => {
        const args = [
            'tunnel', 'run', '--config', '/tmp/test-config.yml',
            testTunnelName
        ];

        console.log(`🚀 启动命令: cloudflared ${args.join(' ')}`);
        
        // 创建临时配置文件
        const configContent = `
tunnel: ${testTunnelName}
credentials-file: ${path.join(os.homedir(), '.cloudflared', 'cert.pem')}
ingress:
  - hostname: ${testDomain}
    service: http://localhost:3000
  - service: http_status:404
`;

        fs.writeFileSync('/tmp/test-config.yml', configContent);
        
        const child = spawn('cloudflared', args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdoutData = '';
        let stderrData = '';
        let resolved = false;
        
        const cleanup = () => {
            if (child.pid) {
                try {
                    process.kill(child.pid, 'SIGTERM');
                } catch (e) {
                    // 忽略错误
                }
            }
            
            try {
                fs.unlinkSync('/tmp/test-config.yml');
            } catch (e) {
                // 忽略错误
            }
        };

        // 设置测试超时
        const timeoutRef = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                console.log('\n⏰ 测试超时（30秒），停止进程');
                cleanup();
                
                // 输出收集到的所有数据
                console.log('\n📊 收集到的输出数据：');
                console.log('=' .repeat(80));
                console.log('STDOUT:');
                console.log(stdoutData || '(无输出)');
                console.log('\nSTDERR:');  
                console.log(stderrData || '(无输出)');
                console.log('=' .repeat(80));
                
                resolve({
                    stdout: stdoutData,
                    stderr: stderrData,
                    success: false,
                    reason: 'timeout'
                });
            }
        }, 30000);

        child.stdout.on('data', (data) => {
            const text = data.toString();
            stdoutData += text;
            
            console.log(`📤 [STDOUT] ${text.trim()}`);
            
            // 测试我们现有的检测逻辑
            if (text.includes('Registered tunnel connection') || 
                text.includes('connection established') ||
                (text.includes('INF') && text.includes('connection='))) {
                
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutRef);
                    console.log('\n✅ 成功检测到隧道连接建立！');
                    cleanup();
                    
                    resolve({
                        stdout: stdoutData,
                        stderr: stderrData,
                        success: true,
                        reason: 'connection_detected'
                    });
                }
            }
        });

        child.stderr.on('data', (data) => {
            const text = data.toString();
            stderrData += text;
            
            console.log(`📥 [STDERR] ${text.trim()}`);
            
            if (text.includes('failed to connect') || text.includes('connection refused')) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutRef);
                    cleanup();
                    
                    resolve({
                        stdout: stdoutData,
                        stderr: stderrData,
                        success: false,
                        reason: 'connection_failed'
                    });
                }
            }
        });

        child.on('exit', (code) => {
            console.log(`🔄 进程退出，代码: ${code}`);
            
            if (!resolved) {
                resolved = true;
                clearTimeout(timeoutRef);
                cleanup();
                
                resolve({
                    stdout: stdoutData,
                    stderr: stderrData,
                    success: false,
                    reason: `process_exit_${code}`
                });
            }
        });

        child.on('error', (err) => {
            console.log(`❌ 进程错误: ${err.message}`);
            
            if (!resolved) {
                resolved = true;
                clearTimeout(timeoutRef);
                cleanup();
                
                resolve({
                    stdout: stdoutData,
                    stderr: stderrData,
                    success: false,
                    reason: `process_error: ${err.message}`
                });
            }
        });

        // 清理函数 - 进程终止时清理
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
    });
}

// 运行测试
testTunnelStartup().then(result => {
    console.log('\n🎯 测试结果：');
    console.log('=' .repeat(80));
    console.log(`成功: ${result.success}`);
    console.log(`原因: ${result.reason}`);
    console.log(`STDOUT字节数: ${result.stdout.length}`);
    console.log(`STDERR字节数: ${result.stderr.length}`);
    
    // 写入文件供进一步分析
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = `cloudflared-output-${timestamp}.log`;
    
    const logContent = `
测试时间: ${new Date().toISOString()}
命令: cloudflared tunnel run --config /tmp/test-config.yml ${testTunnelName}
结果: ${result.success ? '成功' : '失败'}
原因: ${result.reason}

========== STDOUT ==========
${result.stdout}

========== STDERR ==========
${result.stderr}

========== 分析 ==========
${analyzeOutput(result.stdout, result.stderr)}
`;

    fs.writeFileSync(outputFile, logContent);
    console.log(`📝 详细日志已保存到: ${outputFile}`);
    
}).catch(err => {
    console.error('❌ 测试失败:', err);
});

function analyzeOutput(stdout, stderr) {
    let analysis = '';
    
    // 检查成功连接的模式
    const connectionPatterns = [
        /Registered tunnel connection/g,
        /connection established/g,
        /INF.*connection=/g,
        /connIndex=\d+/g,
        /Starting tunnel/g,
        /Version \d+/g
    ];
    
    analysis += '检测模式匹配结果:\n';
    
    const allOutput = stdout + stderr;
    connectionPatterns.forEach((pattern, index) => {
        const matches = allOutput.match(pattern);
        analysis += `${index + 1}. ${pattern}: ${matches ? `匹配 ${matches.length} 次` : '无匹配'}\n`;
        if (matches) {
            matches.slice(0, 3).forEach(match => {
                analysis += `   - "${match}"\n`;
            });
        }
    });
    
    return analysis;
}

console.log('\n⚠️  注意：这个测试需要 cloudflared 认证和有效域名');
console.log('如果没有，测试会失败，但我们仍能看到输出流的情况');