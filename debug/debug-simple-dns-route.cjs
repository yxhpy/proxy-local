#!/usr/bin/env node

/**
 * 简化版本的 DNS 路由冲突调试脚本
 * 专注于分析 cloudflared route dns 命令的行为
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

class SimpleDnsRouteDebugger {
    constructor() {
        this.apiToken = this.getApiToken();
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const prefix = {
            'INFO': '🔍',
            'SUCCESS': '✅',
            'ERROR': '❌',
            'WARN': '⚠️',
            'DEBUG': '🐛'
        };
        
        console.log(`[${timestamp}] ${prefix[level] || '📋'} ${message}`);
        if (data) {
            console.log('   详情:', JSON.stringify(data, null, 2));
        }
    }

    /**
     * 获取保存的API令牌
     */
    getApiToken() {
        try {
            const { homedir } = require('os');
            const configPath = path.join(homedir(), '.uvx', 'config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return config.cloudflare?.apiToken;
            }
        } catch (error) {
            this.log('WARN', '无法读取配置文件:', error.message);
        }
        return null;
    }

    /**
     * 执行 cloudflared 命令
     */
    async executeCloudflaredCommand(args) {
        return new Promise((resolve, reject) => {
            this.log('INFO', `执行命令: cloudflared ${args.join(' ')}`);
            
            const process = spawn('cloudflared', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                resolve({
                    code,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    success: code === 0
                });
            });

            process.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * 发送 Cloudflare API 请求
     */
    async makeCloudflareApiRequest(endpoint, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.apiToken) {
                reject(new Error('No API token available'));
                return;
            }

            const requestOptions = {
                hostname: 'api.cloudflare.com',
                port: 443,
                path: `/client/v4${endpoint}`,
                method: options.method || 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };

            const req = https.request(requestOptions, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve({
                            statusCode: res.statusCode,
                            data: parsed,
                            success: parsed.success !== false
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (options.body) {
                req.write(JSON.stringify(options.body));
            }

            req.end();
        });
    }

    /**
     * 查询 DNS 记录
     */
    async queryDnsRecords(hostname) {
        try {
            this.log('INFO', `查询域名 ${hostname} 的DNS记录...`);
            
            // 首先获取zones
            const zonesResponse = await this.makeCloudflareApiRequest('/zones');
            if (!zonesResponse.success) {
                throw new Error('Failed to fetch zones');
            }

            const zoneName = this.extractZoneName(hostname);
            const zone = zonesResponse.data.result.find(z => z.name === zoneName);
            
            if (!zone) {
                throw new Error(`Zone not found: ${zoneName}`);
            }

            this.log('SUCCESS', `找到zone: ${zone.name} (${zone.id})`);

            // 查询DNS记录
            const recordsResponse = await this.makeCloudflareApiRequest(
                `/zones/${zone.id}/dns_records?name=${hostname}`
            );

            if (!recordsResponse.success) {
                throw new Error('Failed to fetch DNS records');
            }

            const records = recordsResponse.data.result;
            this.log('INFO', `找到 ${records.length} 条DNS记录`);

            records.forEach((record, index) => {
                this.log('DEBUG', `记录 ${index + 1}:`, {
                    id: record.id,
                    type: record.type,
                    name: record.name,
                    content: record.content
                });
            });

            return { zone, records };

        } catch (error) {
            this.log('ERROR', 'DNS记录查询失败:', error.message);
            throw error;
        }
    }

    /**
     * 提取zone名称
     */
    extractZoneName(hostname) {
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return parts.slice(-2).join('.');
        }
        return hostname;
    }

    /**
     * 主要的分析逻辑
     */
    async analyze(hostname, tunnelId) {
        this.log('INFO', '=== 开始分析 cloudflared DNS 路由冲突 ===');
        this.log('INFO', `域名: ${hostname}`);
        this.log('INFO', `隧道ID: ${tunnelId}`);

        try {
            // 1. 查询当前DNS记录
            this.log('INFO', '\n=== 步骤1: 查询当前DNS状态 ===');
            const { zone, records } = await this.queryDnsRecords(hostname);

            // 2. 尝试 cloudflared route dns 命令
            this.log('INFO', '\n=== 步骤2: 尝试 cloudflared route dns ===');
            const routeResult = await this.executeCloudflaredCommand([
                'tunnel', 'route', 'dns', tunnelId, hostname
            ]);

            this.log('INFO', 'cloudflared 执行结果:');
            this.log('DEBUG', '退出代码:', routeResult.code);
            this.log('DEBUG', '成功:', routeResult.success);
            if (routeResult.stdout) {
                this.log('DEBUG', 'stdout:', routeResult.stdout);
            }
            if (routeResult.stderr) {
                this.log('DEBUG', 'stderr:', routeResult.stderr);
            }

            // 3. 分析结果
            this.log('INFO', '\n=== 步骤3: 分析结果 ===');
            
            if (routeResult.success) {
                this.log('SUCCESS', 'cloudflared route dns 成功执行');
            } else {
                this.analyzeFailure(routeResult, records);
            }

            // 4. 列出现有路由
            this.log('INFO', '\n=== 步骤4: 检查现有路由 ===');
            try {
                const routeList = await this.executeCloudflaredCommand(['tunnel', 'route', 'list']);
                this.log('INFO', '路由列表:');
                this.log('DEBUG', routeList.stdout);
            } catch (error) {
                this.log('WARN', '无法获取路由列表:', error.message);
            }

        } catch (error) {
            this.log('ERROR', '分析过程出错:', error.message);
        }
    }

    /**
     * 分析失败原因
     */
    analyzeFailure(routeResult, dnsRecords) {
        this.log('WARN', 'cloudflared route dns 命令失败');
        
        const isRecordExistsError = routeResult.stderr && (
            routeResult.stderr.includes('record with that host already exists') ||
            routeResult.stderr.includes('An A, AAAA, or CNAME record with that host already exists')
        );

        if (isRecordExistsError) {
            this.log('WARN', '确认是"记录已存在"错误');
            this.log('INFO', `API查询发现 ${dnsRecords.length} 条DNS记录`);
            
            if (dnsRecords.length === 0) {
                this.log('ERROR', '🚨 关键发现: API显示无记录，但cloudflared认为有记录！');
                this.log('ERROR', '这证明了cloudflared使用与DNS API不同的数据源');
            } else {
                this.log('INFO', 'API和cloudflared的判断一致 - 确实存在DNS记录');
            }
            
            this.log('INFO', '\n💡 解决方案:');
            this.log('INFO', '1. 先用 API 删除现有 DNS 记录');
            this.log('INFO', '2. 轮询确认删除成功');
            this.log('INFO', '3. 再执行 cloudflared route dns');
        } else {
            this.log('INFO', '非"记录已存在"错误，可能是其他问题');
        }
    }
}

// 主函数
async function main() {
    const hostname = process.argv[2] || 'gemini.yxhpy.xyz';
    const tunnelId = process.argv[3] || '4458fb3c-71b3-436d-a0ec-ba96b799a53b';

    const analyzer = new SimpleDnsRouteDebugger();
    await analyzer.analyze(hostname, tunnelId);
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ 程序失败:', error.message);
        process.exit(1);
    });
}

module.exports = SimpleDnsRouteDebugger;