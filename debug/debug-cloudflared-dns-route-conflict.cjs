#!/usr/bin/env node

/**
 * Debug script to analyze cloudflared tunnel route dns command behavior
 * 调试 cloudflared DNS 路由创建失败的根本原因
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load configuration and modules
const CloudflareDomainManager = require('./src/utils/cloudflare-domain-manager');
const CloudflareAuth = require('./src/utils/cloudflare-auth');

class CloudflaredDnsRouteDebugger {
    constructor() {
        this.debug = true;
        this.auth = new CloudflareAuth();
        this.domainManager = null;
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
        if (data && this.debug) {
            console.log('   数据详情:', JSON.stringify(data, null, 2));
        }
    }

    /**
     * 执行 cloudflared 命令并捕获详细输出
     */
    async executeCloudflaredCommand(args) {
        return new Promise((resolve, reject) => {
            this.log('DEBUG', `执行 cloudflared 命令: cloudflared ${args.join(' ')}`);
            
            const process = spawn('cloudflared', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                this.log('DEBUG', 'cloudflared stdout:', output.trim());
            });

            process.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                this.log('DEBUG', 'cloudflared stderr:', output.trim());
            });

            process.on('close', (code) => {
                this.log('DEBUG', `cloudflared 命令退出，代码: ${code}`);
                resolve({
                    code,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    success: code === 0
                });
            });

            process.on('error', (error) => {
                this.log('ERROR', 'cloudflared 命令执行错误:', error.message);
                reject(error);
            });
        });
    }

    /**
     * 查询指定域名的所有 DNS 记录
     */
    async queryDnsRecords(hostname) {
        try {
            const credentials = await this.auth.getValidCredentials();
            if (!credentials) {
                throw new Error('无法获取有效的 Cloudflare API 凭据');
            }

            this.domainManager = new CloudflareDomainManager(credentials);
            
            this.log('INFO', `查询域名 ${hostname} 的DNS记录...`);
            
            // 获取zone信息
            const zoneName = this.extractZoneName(hostname);
            this.log('DEBUG', `提取的zone名称: ${zoneName}`);
            
            const zones = await this.domainManager.listZones();
            const zone = zones.find(z => z.name === zoneName);
            
            if (!zone) {
                throw new Error(`未找到zone: ${zoneName}`);
            }
            
            this.log('SUCCESS', `找到zone: ${zone.name} (ID: ${zone.id})`);
            
            // 查询DNS记录
            const records = await this.domainManager.getDnsRecords(zone.id, hostname);
            
            this.log('INFO', `找到 ${records.length} 条DNS记录:`);
            records.forEach((record, index) => {
                this.log('DEBUG', `记录 ${index + 1}:`, {
                    id: record.id,
                    type: record.type,
                    name: record.name,
                    content: record.content,
                    created_on: record.created_on,
                    modified_on: record.modified_on
                });
            });
            
            return { zone, records };
        } catch (error) {
            this.log('ERROR', 'DNS记录查询失败:', error.message);
            throw error;
        }
    }

    /**
     * 从完整域名提取zone名称
     */
    extractZoneName(hostname) {
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return parts.slice(-2).join('.');
        }
        return hostname;
    }

    /**
     * 分析问题的核心方法
     */
    async analyzeRouteConflict(hostname, tunnelId) {
        this.log('INFO', '=== 开始分析 cloudflared DNS 路由冲突问题 ===');
        this.log('INFO', `目标域名: ${hostname}`);
        this.log('INFO', `隧道ID: ${tunnelId}`);
        
        try {
            // 1. 查询当前DNS记录状态
            this.log('INFO', '\n=== 步骤1: 查询当前DNS记录 ===');
            const { zone, records } = await this.queryDnsRecords(hostname);
            
            // 2. 尝试执行 cloudflared tunnel route dns 命令
            this.log('INFO', '\n=== 步骤2: 尝试执行 cloudflared route dns 命令 ===');
            const routeResult = await this.executeCloudflaredCommand([
                'tunnel', 'route', 'dns', tunnelId, hostname
            ]);
            
            this.log('INFO', 'cloudflared route dns 执行结果:', {
                exitCode: routeResult.code,
                success: routeResult.success,
                stdout: routeResult.stdout,
                stderr: routeResult.stderr
            });
            
            // 3. 如果失败，分析失败原因
            if (!routeResult.success) {
                this.log('WARN', '\n=== 步骤3: 分析失败原因 ===');
                this.analyzeFailureReason(routeResult, records);
            }
            
            // 4. 检查 cloudflared 可能使用的其他状态源
            this.log('INFO', '\n=== 步骤4: 检查 cloudflared 状态源 ===');
            await this.checkCloudflaredStateSources(tunnelId);
            
            // 5. 提供修复建议
            this.log('INFO', '\n=== 步骤5: 修复建议 ===');
            this.provideFix(hostname, tunnelId, records);
            
        } catch (error) {
            this.log('ERROR', '分析过程中发生错误:', error.message);
            throw error;
        }
    }

    /**
     * 分析失败原因
     */
    analyzeFailureReason(routeResult, dnsRecords) {
        this.log('INFO', '分析 cloudflared 失败原因...');
        
        // 检查是否是记录已存在错误
        const isRecordExistsError = routeResult.stderr.includes('record with that host already exists') ||
                                  routeResult.stderr.includes('An A, AAAA, or CNAME record with that host already exists');
        
        if (isRecordExistsError) {
            this.log('WARN', '确认是"记录已存在"错误');
            this.log('INFO', '对比API查询的DNS记录:');
            
            if (dnsRecords.length === 0) {
                this.log('WARN', '⚠️  API查询显示没有DNS记录，但cloudflared认为记录存在！');
                this.log('WARN', '这表明cloudflared可能使用了与DNS API不同的数据源');
            } else {
                this.log('INFO', `API查询找到 ${dnsRecords.length} 条记录，与cloudflared的判断一致`);
                dnsRecords.forEach(record => {
                    this.log('INFO', `  - ${record.type} 记录: ${record.name} -> ${record.content}`);
                });
            }
        } else {
            this.log('INFO', '不是"记录已存在"错误，可能是其他问题');
        }
    }

    /**
     * 检查 cloudflared 可能使用的其他状态源
     */
    async checkCloudflaredStateSources(tunnelId) {
        this.log('INFO', '检查 cloudflared 可能的状态源...');
        
        // 1. 检查本地隧道配置
        const homeDir = require('os').homedir();
        const cloudflaredDir = path.join(homeDir, '.cloudflared');
        
        this.log('INFO', `检查 cloudflared 配置目录: ${cloudflaredDir}`);
        
        if (fs.existsSync(cloudflaredDir)) {
            const files = fs.readdirSync(cloudflaredDir);
            this.log('DEBUG', '找到的文件:', files);
            
            // 检查隧道凭据文件
            const credentialFile = path.join(cloudflaredDir, `${tunnelId}.json`);
            if (fs.existsSync(credentialFile)) {
                this.log('INFO', `找到隧道凭据文件: ${credentialFile}`);
                try {
                    const credentials = JSON.parse(fs.readFileSync(credentialFile, 'utf8'));
                    this.log('DEBUG', '隧道凭据内容:', credentials);
                } catch (error) {
                    this.log('WARN', '无法读取隧道凭据文件:', error.message);
                }
            }
            
            // 检查配置文件
            const configFile = path.join(cloudflaredDir, 'config.yml');
            if (fs.existsSync(configFile)) {
                this.log('INFO', `找到配置文件: ${configFile}`);
                try {
                    const config = fs.readFileSync(configFile, 'utf8');
                    this.log('DEBUG', '配置文件内容:', config);
                } catch (error) {
                    this.log('WARN', '无法读取配置文件:', error.message);
                }
            }
        }
        
        // 2. 列出现有隧道
        this.log('INFO', '列出现有隧道...');
        try {
            const tunnelListResult = await this.executeCloudflaredCommand(['tunnel', 'list']);
            this.log('INFO', '隧道列表结果:', {
                success: tunnelListResult.success,
                output: tunnelListResult.stdout
            });
        } catch (error) {
            this.log('WARN', '无法列出隧道:', error.message);
        }
        
        // 3. 查询隧道路由信息
        this.log('INFO', '查询隧道路由信息...');
        try {
            const routeListResult = await this.executeCloudflaredCommand(['tunnel', 'route', 'list']);
            this.log('INFO', '路由列表结果:', {
                success: routeListResult.success,
                output: routeListResult.stdout
            });
        } catch (error) {
            this.log('WARN', '无法列出路由:', error.message);
        }
    }

    /**
     * 提供修复建议
     */
    provideFix(hostname, tunnelId, dnsRecords) {
        this.log('INFO', '=== 修复建议 ===');
        
        if (dnsRecords.length > 0) {
            this.log('INFO', '建议的修复步骤:');
            this.log('INFO', '1. 先通过 Cloudflare API 删除现有的 DNS 记录');
            this.log('INFO', '2. 等待一段时间确保删除生效 (轮询确认)');
            this.log('INFO', '3. 再执行 cloudflared tunnel route dns 命令');
            
            this.log('DEBUG', '需要删除的记录:');
            dnsRecords.forEach(record => {
                this.log('DEBUG', `  - 记录ID: ${record.id}, 类型: ${record.type}, 内容: ${record.content}`);
            });
        } else {
            this.log('INFO', 'API 显示没有冲突记录，这可能是 cloudflared 内部状态问题');
            this.log('INFO', '建议检查:');
            this.log('INFO', '1. cloudflared 是否有内部缓存需要清理');
            this.log('INFO', '2. 隧道路由表是否有残留配置');
            this.log('INFO', '3. 考虑删除并重新创建隧道');
        }
    }
}

// 主函数
async function main() {
    const analyzer = new CloudflaredDnsRouteDebugger();
    
    // 从命令行参数获取域名和隧道ID，或使用示例值
    const hostname = process.argv[2] || 'gemini.yxhpy.xyz';
    const tunnelId = process.argv[3] || '4458fb3c-71b3-436d-a0ec-ba96b799a53b';
    
    try {
        await analyzer.analyzeRouteConflict(hostname, tunnelId);
    } catch (error) {
        console.error('❌ Debug 过程失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(error => {
        console.error('❌ 程序执行失败:', error.message);
        process.exit(1);
    });
}

module.exports = CloudflaredDnsRouteDebugger;