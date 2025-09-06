import inquirer from 'inquirer';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';

/**
 * Cloudflare 域名管理器
 * 处理域名选择、固定设置和A记录筛选
 */
export class CloudflareDomainManager {
  constructor() {
    this.configDir = join(homedir(), '.uvx');
    this.configFile = join(this.configDir, 'config.json');
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
   * 检查用户是否已登录 Cloudflare
   */
  async isAuthenticated() {
    try {
      const cloudflaredDir = join(homedir(), '.cloudflared');
      const certPath = join(cloudflaredDir, 'cert.pem');
      
      if (!existsSync(certPath)) {
        return false;
      }

      return new Promise((resolve) => {
        const child = spawn('cloudflared', ['tunnel', 'list'], {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let hasValidOutput = false;

        child.stdout.on('data', (data) => {
          const output = data.toString();
          if (output.includes('NAME') || output.includes('No tunnels') || output.includes('ID')) {
            hasValidOutput = true;
          }
        });

        child.on('close', (code) => {
          resolve(hasValidOutput || code === 0);
        });

        child.on('error', () => {
          resolve(false);
        });

        setTimeout(() => {
          if (!child.killed) {
            child.kill();
            resolve(false);
          }
        }, 5000);
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * 执行 Cloudflare 登录
   */
  async performLogin() {
    console.log(chalk.blue('🔐 启动 Cloudflare 登录流程...'));
    console.log(chalk.yellow('请在浏览器中完成登录，然后回到终端。'));
    
    return new Promise((resolve, reject) => {
      const child = spawn('cloudflared', ['tunnel', 'login'], {
        stdio: 'inherit'
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green('✅ Cloudflare 登录成功！'));
          resolve(true);
        } else {
          reject(new Error(`登录失败，退出代码: ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`启动登录进程失败: ${err.message}`));
      });
    });
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
}