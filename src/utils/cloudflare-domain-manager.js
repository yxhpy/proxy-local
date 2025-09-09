import inquirer from 'inquirer';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import { CloudflareAuth } from './cloudflare-auth.js';

/**
 * Cloudflare 域名管理器
 * 处理域名选择、固定设置、A记录筛选和DNS记录管理
 */
export class CloudflareDomainManager {
  constructor() {
    this.configDir = join(homedir(), '.uvx');
    this.configFile = join(this.configDir, 'config.json');
    this.apiBaseUrl = 'https://api.cloudflare.com/client/v4';
    this.auth = new CloudflareAuth(); // 使用新的认证管理器
    this.initConfig();
  }

  /**
   * 初始化配置目录和文件
   */
  initConfig() {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
    
    if (!existsSync(this.configFile)) {
      const defaultConfig = {
        cloudflare: {
          fixedDomain: null,
          lastUsedDomain: null
        }
      };
      writeFileSync(this.configFile, JSON.stringify(defaultConfig, null, 2));
    }
  }

  /**
   * 读取配置
   */
  readConfig() {
    try {
      const configData = readFileSync(this.configFile, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.warn(chalk.yellow(`读取配置文件失败: ${error.message}`));
      return {
        cloudflare: {
          fixedDomain: null,
          lastUsedDomain: null
        }
      };
    }
  }

  /**
   * 保存配置
   */
  saveConfig(config) {
    try {
      writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      console.warn(chalk.yellow(`保存配置文件失败: ${error.message}`));
    }
  }

  /**
   * 获取固定域名
   */
  getFixedDomain() {
    const config = this.readConfig();
    return config.cloudflare?.fixedDomain || null;
  }

  /**
   * 设置固定域名
   */
  setFixedDomain(domain) {
    const config = this.readConfig();
    if (!config.cloudflare) {
      config.cloudflare = {};
    }
    config.cloudflare.fixedDomain = domain;
    this.saveConfig(config);
  }

  /**
   * 清除固定域名
   */
  clearFixedDomain() {
    const config = this.readConfig();
    if (config.cloudflare) {
      config.cloudflare.fixedDomain = null;
    }
    this.saveConfig(config);
  }

  /**
   * 检查用户是否已通过 API 令牌认证（重构后）
   * @returns {Promise<boolean>} 是否有有效的 API 令牌
   */
  async isAuthenticated() {
    try {
      const token = await this.auth.getValidCloudflareToken();
      return !!token;
    } catch (error) {
      console.warn(chalk.yellow(`检查认证状态失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 执行 Cloudflare API 令牌认证（重构后）
   * @returns {Promise<boolean>} 认证是否成功
   */
  async performLogin() {
    console.log(chalk.blue('🔐 启动 Cloudflare API 令牌认证流程...'));
    console.log(chalk.yellow('已废弃浏览器登录方式，使用更安全的 API 令牌认证'));
    
    try {
      const success = await this.auth.ensureValidToken();
      if (success) {
        console.log(chalk.green('✅ Cloudflare API 令牌认证成功！'));
        return true;
      } else {
        throw new Error('API 令牌认证失败');
      }
    } catch (error) {
      console.error(chalk.red(`认证失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 获取用户账户下的域名列表
   * 通过 cloudflared 获取真实的域名信息
   */
  async getDomainList() {
    return new Promise((resolve, reject) => {
      // 使用 cloudflared tunnel route dns 来获取域名信息
      // 但这个命令需要已有的隧道，所以我们改用另一种方法
      
      // 实际上 cloudflared 没有直接的命令来列出所有域名
      // 最好的做法是检查现有隧道的配置或让用户手动输入
      console.log(chalk.yellow('📝 当前版本需要您手动输入域名'));
      console.log(chalk.gray('未来版本将集成 Cloudflare API 来自动获取域名列表'));
      
      // 返回空列表，让用户选择自定义输入
      resolve([]);
    });
  }

  /**
   * 筛选有A记录的域名
   */
  filterARecordDomains(domains) {
    return domains.filter(domain => domain.hasARecord);
  }

  /**
   * 显示交互式域名选择菜单
   */
  async showDomainSelectionMenu(options = {}) {
    const { resetDomain = false } = options;
    
    // 检查环境变量中是否指定了自定义域名
    const envCustomDomain = process.env.UVX_CUSTOM_DOMAIN;
    if (envCustomDomain && !resetDomain) {
      console.log(chalk.green(`🌍 使用环境变量指定的域名: ${envCustomDomain}`));
      return {
        type: 'custom',
        domain: envCustomDomain
      };
    }
    
    // 如果有固定域名且不是重置模式，直接使用
    if (!resetDomain) {
      const fixedDomain = this.getFixedDomain();
      if (fixedDomain) {
        console.log(chalk.green(`🔗 使用已固定的域名: ${fixedDomain}`));
        return {
          type: 'fixed',
          domain: fixedDomain
        };
      }
    }

    // 检查是否为非交互式环境（CI/CD等）
    if (process.env.CI || process.env.NON_INTERACTIVE || !process.stdin.isTTY) {
      console.log(chalk.yellow('🤖 检测到非交互式环境，使用默认随机域名'));
      return {
        type: 'random',
        domain: null
      };
    }

    console.log(chalk.blue('🌐 请选择域名配置方式:'));
    
    const choices = [
      {
        name: '随机域名 (*.trycloudflare.com)',
        value: 'random',
        short: '随机域名'
      },
      {
        name: '从账户选择A记录域名 (需要登录)',
        value: 'account',
        short: '账户域名'
      },
      {
        name: '手动输入自定义域名',
        value: 'custom',
        short: '自定义域名'
      }
    ];

    const { domainType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'domainType',
        message: '选择域名类型:',
        choices: choices,
        default: 'random'
      }
    ]);

    let selectedDomain = null;
    let domainResult = { type: domainType };

    switch (domainType) {
      case 'random':
        console.log(chalk.green('✨ 将使用随机的 *.trycloudflare.com 域名'));
        domainResult.domain = null; // 随机域名
        break;

      case 'account':
        const accountResult = await this.handleAccountDomainSelection();
        if (!accountResult.success) {
          // 如果账户域名选择失败，回退到随机域名
          console.log(chalk.yellow('⚠️  回退到使用随机域名'));
          domainResult = { type: 'random', domain: null };
        } else {
          domainResult.domain = accountResult.domain;
        }
        break;

      case 'custom':
        const customResult = await this.handleCustomDomainInput();
        domainResult.domain = customResult.domain;
        break;
    }

    // 询问是否要固定这个域名选择
    if (domainType !== 'random') {
      const { shouldFix } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldFix',
          message: '是否要固定此域名选择？(下次将自动使用)',
          default: false
        }
      ]);

      if (shouldFix) {
        this.setFixedDomain(domainResult.domain);
        console.log(chalk.green(`🔒 域名已固定: ${domainResult.domain}`));
        console.log(chalk.gray('提示: 使用 --reset-domain 参数可以重新选择域名'));
      }
    }

    return domainResult;
  }

  /**
   * 处理账户域名选择
   */
  async handleAccountDomainSelection() {
    try {
      // 检查认证状态
      const authenticated = await this.isAuthenticated();
      
      if (!authenticated) {
        console.log(chalk.yellow('🔑 需要先登录 Cloudflare 账户'));
        const { shouldLogin } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldLogin',
            message: '是否现在登录？',
            default: true
          }
        ]);

        if (!shouldLogin) {
          return { success: false };
        }

        await this.performLogin();
      }

      console.log(chalk.blue('🔍 正在获取域名列表...'));
      const allDomains = await this.getDomainList();
      const aRecordDomains = this.filterARecordDomains(allDomains);

      if (aRecordDomains.length === 0) {
        console.log(chalk.yellow('⚠️  无法自动获取域名列表，将切换到手动输入模式'));
        
        // 自动切换到自定义域名输入
        const customResult = await this.handleCustomDomainInput();
        return { success: true, domain: customResult.domain };
      }

      const domainChoices = aRecordDomains.map(domain => ({
        name: `${domain.name} (A记录)`,
        value: domain.name,
        short: domain.name
      }));

      const { selectedDomain } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedDomain',
          message: '选择要使用的域名:',
          choices: domainChoices
        }
      ]);

      return { success: true, domain: selectedDomain };
    } catch (error) {
      console.log(chalk.red(`❌ 获取域名列表失败: ${error.message}`));
      return { success: false };
    }
  }

  /**
   * 处理自定义域名输入
   */
  async handleCustomDomainInput() {
    const { customDomain } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customDomain',
        message: '请输入自定义域名:',
        validate: (input) => {
          if (!input.trim()) {
            return '域名不能为空';
          }
          // 简单的域名格式验证
          const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
          if (!domainRegex.test(input.trim())) {
            return '请输入有效的域名格式';
          }
          return true;
        }
      }
    ]);

    console.log(chalk.yellow('⚠️  请确保该域名的DNS已指向Cloudflare，并配置了正确的A记录'));
    
    return { domain: customDomain.trim() };
  }

  /**
   * 显示域名重置提示
   */
  showResetInstructions() {
    console.log(chalk.blue('💡 域名管理提示:'));
    console.log(chalk.gray('  使用 --reset-domain 参数可以重新选择域名'));
    console.log(chalk.gray('  固定的域名配置保存在: ~/.uvx/config.json'));
  }

  /**
   * 获取 Cloudflare API 凭据（重构后）
   * 使用新的认证系统获取 API 令牌
   * @returns {Promise<Object|null>} API 凭据对象或 null
   */
  async getApiCredentials() {
    try {
      const token = await this.auth.getValidCloudflareToken();
      if (token) {
        return {
          type: 'token',
          value: token
        };
      }
      return null;
    } catch (error) {
      console.warn(chalk.yellow(`获取 API 凭据失败: ${error.message}`));
      return null;
    }
  }

  /**
   * 创建 Cloudflare API 请求头
   */
  createApiHeaders(credentials) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (credentials.type === 'token') {
      headers['Authorization'] = `Bearer ${credentials.value}`;
    } else if (credentials.type === 'key') {
      headers['X-Auth-Email'] = credentials.email;
      headers['X-Auth-Key'] = credentials.value;
    }

    return headers;
  }

  /**
   * 获取域名的 Zone ID（重构后）
   * @param {string} domain 域名
   * @returns {Promise<string|null>} Zone ID 或 null
   */
  async getZoneId(domain) {
    const credentials = await this.getApiCredentials();
    if (!credentials) {
      throw new Error('缺少有效的 Cloudflare API 令牌。请先设置 API 令牌');
    }

    try {
      // 解析域名以获取根域名
      const domainParts = domain.split('.');
      const rootDomain = domainParts.length >= 2 
        ? domainParts.slice(-2).join('.')
        : domain;

      const headers = this.createApiHeaders(credentials);
      const url = `${this.apiBaseUrl}/zones?name=${rootDomain}`;

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`Cloudflare API 请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Cloudflare API 错误: ${data.errors?.map(e => e.message).join(', ') || '未知错误'}`);
      }

      if (data.result && data.result.length > 0) {
        return data.result[0].id;
      }

      return null;
    } catch (error) {
      console.error(chalk.red(`获取 Zone ID 失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 查找 DNS 记录
   * @param {string} zoneId Zone ID
   * @param {string} recordName 记录名称
   * @param {string} recordType 记录类型（默认 'CNAME'）
   * @returns {Promise<Object|null>} DNS 记录对象或 null
   */
  async findDnsRecord(zoneId, recordName, recordType = 'CNAME') {
    const credentials = await this.getApiCredentials();
    if (!credentials) {
      throw new Error('缺少有效的 Cloudflare API 令牌');
    }

    try {
      const headers = this.createApiHeaders(credentials);
      const url = `${this.apiBaseUrl}/zones/${zoneId}/dns_records?name=${recordName}&type=${recordType}`;

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`Cloudflare API 请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Cloudflare API 错误: ${data.errors?.map(e => e.message).join(', ') || '未知错误'}`);
      }

      // 返回找到的第一个匹配记录
      return data.result && data.result.length > 0 ? data.result[0] : null;
    } catch (error) {
      console.error(chalk.red(`查找 DNS 记录失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 查询指定域名的所有DNS记录
   * @param {string} domain 域名
   * @returns {Promise<Object>} 查询结果
   */
  async queryDnsRecords(domain) {
    try {
      console.log(chalk.gray(`🔍 查询域名 ${domain} 的所有DNS记录...`));

      // 获取 Zone ID
      const zoneId = await this.getZoneId(domain);
      if (!zoneId) {
        console.log(chalk.yellow(`⚠️ 未找到域名 ${domain} 对应的 Cloudflare Zone`));
        return { records: [] };
      }

      const credentials = await this.getApiCredentials();
      if (!credentials) {
        throw new Error('缺少有效的 Cloudflare API 令牌');
      }

      // 查询所有匹配域名的DNS记录
      const url = `${this.apiBaseUrl}/zones/${zoneId}/dns_records?name=${domain}`;
      const response = await fetch(url, {
        headers: this.createApiHeaders(credentials)
      });

      if (!response.ok) {
        throw new Error(`DNS记录查询失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        console.log(chalk.blue(`✅ 找到 ${data.result.length} 条DNS记录`));
        
        // 为每条记录添加zone_id
        const recordsWithZone = data.result.map(record => ({
          ...record,
          zone_id: zoneId
        }));
        
        return { records: recordsWithZone };
      } else {
        throw new Error(`DNS记录查询失败: ${data.errors?.[0]?.message || '未知错误'}`);
      }

    } catch (error) {
      console.log(chalk.red(`❌ 查询DNS记录失败: ${error.message}`));
      return { records: [] };
    }
  }

  /**
   * 智能查找 DNS 记录（支持完整域名查询）
   * @param {string} domain 完整域名
   * @returns {Promise<Object|null>} DNS 记录对象或 null
   */
  async findDnsRecordByDomain(domain) {
    try {
      console.log(chalk.gray(`🔍 查找域名 ${domain} 的 DNS 记录...`));

      // 获取 Zone ID
      const zoneId = await this.getZoneId(domain);
      if (!zoneId) {
        console.log(chalk.yellow(`⚠️ 未找到域名 ${domain} 对应的 Cloudflare Zone`));
        return null;
      }

      console.log(chalk.gray(`✅ 找到 Zone ID: ${zoneId}`));

      // 查找记录
      const record = await this.findDnsRecord(zoneId, domain, 'CNAME');
      
      if (record) {
        console.log(chalk.green(`✅ 找到现有 DNS 记录: ${record.type} ${record.name} → ${record.content}`));
        return {
          ...record,
          zoneId // 添加 zoneId 以便后续更新使用
        };
      } else {
        console.log(chalk.gray(`ℹ️ 未找到域名 ${domain} 的 CNAME 记录`));
        return null;
      }
    } catch (error) {
      console.error(chalk.red(`查找域名 ${domain} 的 DNS 记录失败: ${error.message}`));
      return null;
    }
  }

  /**
   * 更新现有 DNS 记录
   * @param {string} zoneId Zone ID
   * @param {string} recordId DNS 记录 ID
   * @param {Object} recordData 要更新的记录数据
   * @returns {Promise<Object|null>} 更新后的记录对象或 null
   */
  async updateDnsRecord(zoneId, recordId, recordData) {
    const credentials = await this.getApiCredentials();
    if (!credentials) {
      throw new Error('缺少有效的 Cloudflare API 令牌');
    }

    try {
      const headers = this.createApiHeaders(credentials);
      const url = `${this.apiBaseUrl}/zones/${zoneId}/dns_records/${recordId}`;

      console.log(chalk.gray(`🔄 更新 DNS 记录 ${recordId}...`));

      const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(recordData)
      });
      
      if (!response.ok) {
        throw new Error(`Cloudflare API 请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Cloudflare API 错误: ${data.errors?.map(e => e.message).join(', ') || '未知错误'}`);
      }

      console.log(chalk.green(`✅ DNS 记录更新成功: ${data.result.type} ${data.result.name} → ${data.result.content}`));
      return data.result;
    } catch (error) {
      console.error(chalk.red(`更新 DNS 记录失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 创建新的 DNS 记录
   * @param {string} zoneId Zone ID
   * @param {Object} recordData 记录数据
   * @returns {Promise<Object|null>} 创建的记录对象或 null
   */
  async createDnsRecord(zoneId, recordData) {
    const credentials = await this.getApiCredentials();
    if (!credentials) {
      throw new Error('缺少有效的 Cloudflare API 令牌');
    }

    try {
      const headers = this.createApiHeaders(credentials);
      const url = `${this.apiBaseUrl}/zones/${zoneId}/dns_records`;

      console.log(chalk.gray(`➕ 创建 DNS 记录 ${recordData.name}...`));

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(recordData)
      });
      
      if (!response.ok) {
        throw new Error(`Cloudflare API 请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Cloudflare API 错误: ${data.errors?.map(e => e.message).join(', ') || '未知错误'}`);
      }

      console.log(chalk.green(`✅ DNS 记录创建成功: ${data.result.type} ${data.result.name} → ${data.result.content}`));
      return data.result;
    } catch (error) {
      console.error(chalk.red(`创建 DNS 记录失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 删除 DNS 记录
   * @param {string} zoneId Zone ID
   * @param {string} recordId DNS 记录 ID
   * @returns {Promise<boolean>} 删除是否成功
   */
  async deleteDnsRecord(zoneId, recordId) {
    const credentials = await this.getApiCredentials();
    if (!credentials) {
      throw new Error('缺少有效的 Cloudflare API 令牌');
    }

    try {
      const headers = this.createApiHeaders(credentials);
      const url = `${this.apiBaseUrl}/zones/${zoneId}/dns_records/${recordId}`;

      console.log(chalk.gray(`🗑️ 删除 DNS 记录 ${recordId}...`));

      const response = await fetch(url, {
        method: 'DELETE',
        headers
      });
      
      if (!response.ok) {
        throw new Error(`Cloudflare API 请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Cloudflare API 错误: ${data.errors?.map(e => e.message).join(', ') || '未知错误'}`);
      }

      console.log(chalk.green(`✅ DNS 记录删除成功`));
      return true;
    } catch (error) {
      console.error(chalk.red(`删除 DNS 记录失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 智能更新或创建 DNS 记录
   * @param {string} domain 域名
   * @param {string} content 记录内容（如 CNAME 目标）
   * @param {Object} options 选项
   * @returns {Promise<Object>} 操作结果
   */
  async upsertDnsRecord(domain, content, options = {}) {
    try {
      const {
        type = 'CNAME',
        ttl = 300,
        proxied = false,
        comment = null
      } = options;

      console.log(chalk.blue(`🌐 智能管理域名 ${domain} 的 DNS 记录...`));

      // 获取 Zone ID
      const zoneId = await this.getZoneId(domain);
      if (!zoneId) {
        throw new Error(`未找到域名 ${domain} 对应的 Cloudflare Zone`);
      }

      // 查找现有记录
      const existingRecord = await this.findDnsRecord(zoneId, domain, type);
      
      const recordData = {
        type,
        name: domain,
        content,
        ttl,
        proxied
      };

      if (comment) {
        recordData.comment = comment;
      }

      if (existingRecord) {
        // 记录存在，检查是否需要更新
        if (existingRecord.content !== content || 
            existingRecord.proxied !== proxied ||
            existingRecord.ttl !== ttl) {
          
          console.log(chalk.yellow(`🔄 检测到记录内容变化，更新现有记录...`));
          console.log(chalk.gray(`  旧内容: ${existingRecord.content}`));
          console.log(chalk.gray(`  新内容: ${content}`));
          
          const updatedRecord = await this.updateDnsRecord(zoneId, existingRecord.id, recordData);
          
          return {
            action: 'updated',
            record: updatedRecord,
            message: `成功更新 ${type} 记录: ${domain} → ${content}`
          };
        } else {
          console.log(chalk.green(`✨ 记录内容无变化，无需更新`));
          
          return {
            action: 'unchanged',
            record: existingRecord,
            message: `${type} 记录已是最新: ${domain} → ${content}`
          };
        }
      } else {
        // 记录不存在，创建新记录
        console.log(chalk.blue(`➕ 创建新的 ${type} 记录...`));
        
        const newRecord = await this.createDnsRecord(zoneId, recordData);
        
        return {
          action: 'created',
          record: newRecord,
          message: `成功创建 ${type} 记录: ${domain} → ${content}`
        };
      }
    } catch (error) {
      console.error(chalk.red(`DNS 记录管理失败: ${error.message}`));
      throw error;
    }
  }
}