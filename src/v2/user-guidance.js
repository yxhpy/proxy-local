import inquirer from 'inquirer';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { EnhancedLogger } from '../utils/enhanced-logger.js';
import { ConfigManager } from './config-manager.js';
import { ValidationEngine } from './validation-engine.js';
import { TunnelLifecycle } from './tunnel-lifecycle.js';
import { DNSManager } from './dns-manager.js';
import { ErrorHandler } from './error-handler.js';

/**
 * V2用户交互流程管理器
 * 实现极简的一键式代理体验
 */
export class UserGuidance {
  constructor() {
    this.logger = new EnhancedLogger('UserGuidance-V2');
    
    // 初始化核心模块
    this.configManager = new ConfigManager();
    this.validationEngine = new ValidationEngine();
    this.errorHandler = new ErrorHandler();
    
    // 延迟初始化其他模块（依赖configManager）
    this.tunnelLifecycle = null;
    this.dnsManager = null;

    // 会话状态
    this.sessionId = this.generateSessionId();
    this.currentStep = null;
    this.operationContext = {};
  }

  /**
   * 主要的一键代理方法
   * @param {number} port - 本地端口
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 代理结果
   */
  async createOneClickProxy(port, options = {}) {
    const startTime = Date.now();
    this.logger.logStep('会话开始', 'V2一键代理启动', { 
      sessionId: this.sessionId, 
      port, 
      options 
    });

    try {
      // 第1步：环境预检
      await this.performPreflightChecks();

      // 第2步：智能认证处理
      await this.handleAuthentication(options);

      // 第3步：隧道创建与管理
      const tunnelResult = await this.createTunnel(port, options);

      // 第4步：DNS配置（如果需要）
      let dnsResult = null;
      if (tunnelResult.needsDns) {
        dnsResult = await this.configureDns(tunnelResult);
      }

      // 第5步：最终验证
      const validationResult = await this.performFinalValidation(tunnelResult, dnsResult);

      // 构建成功响应
      const result = {
        success: true,
        url: validationResult.finalUrl || tunnelResult.url,
        tunnel: tunnelResult,
        dns: dnsResult,
        validation: validationResult,
        sessionId: this.sessionId,
        duration: Date.now() - startTime
      };

      this.logger.logStep('会话完成', 'V2一键代理成功', result);
      this.displaySuccessMessage(result);

      return result;

    } catch (error) {
      return await this.handleOperationError(error, { port, options, startTime });
    }
  }

  /**
   * 执行环境预检
   */
  async performPreflightChecks() {
    this.currentStep = '环境预检';
    this.logger.logStep('预检开始', '执行环境预检');

    try {
      const preflightResult = await this.validationEngine.runPreflightChecks();
      
      if (!preflightResult.passed) {
        // 尝试自动修复
        if (await this.validationEngine.autoFixPreflightIssues(preflightResult)) {
          // 重新检查
          const retryResult = await this.validationEngine.runPreflightChecks();
          if (!retryResult.passed) {
            this.validationEngine.displayPreflightGuidance(retryResult);
            throw new Error('环境预检失败且无法自动修复');
          }
        } else {
          this.validationEngine.displayPreflightGuidance(preflightResult);
          throw new Error('环境预检失败');
        }
      }

      this.logger.logStep('预检通过', '环境预检成功');

    } catch (error) {
      this.logger.logError('预检失败', error);
      const handledError = this.errorHandler.handleError(error, { 
        phase: '环境预检', 
        step: this.currentStep 
      });
      throw new Error(handledError.originalError || handledError.displayMessage || '环境预检失败');
    }
  }

  /**
   * 智能认证处理
   * @param {Object} options - 选项
   */
  async handleAuthentication(options) {
    this.currentStep = '认证处理';
    this.logger.logStep('认证检查', '检查认证状态');

    try {
      // 检查现有认证
      const hasAuth = await this.configManager.checkCertPem();
      const apiToken = this.configManager.getApiToken();

      if (hasAuth && apiToken) {
        this.logger.logStep('认证检查', '发现有效认证，跳过登录');
        return;
      }

      // 需要认证
      if (options.skipAuth) {
        this.logger.logDebug('跳过认证', '使用匿名模式');
        return;
      }

      // 检查是否为非交互环境
      if (process.env.CI || process.env.NON_INTERACTIVE || !process.stdin.isTTY) {
        this.logger.logDebug('非交互环境', '跳过认证流程');
        return;
      }

      // 交互式认证流程
      await this.interactiveAuthentication();

    } catch (error) {
      this.logger.logError('认证处理失败', error);
      const handledError = this.errorHandler.handleError(error, { 
        phase: '认证处理', 
        step: this.currentStep 
      });
      throw new Error(handledError.originalError || handledError.displayMessage || '认证处理失败');
    }
  }

  /**
   * 交互式认证流程
   */
  async interactiveAuthentication() {
    console.log('\n' + chalk.blue('🔐 Cloudflare 认证'));
    console.log('为了获得更好的体验（固定域名、DNS自动配置），建议进行认证。');
    console.log('您也可以跳过认证使用临时模式。\n');

    const { authChoice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'authChoice',
        message: '选择认证方式:',
        choices: [
          {
            name: '🌐 浏览器登录 (推荐)',
            value: 'browser',
            short: '浏览器登录'
          },
          {
            name: '🔑 使用API令牌',
            value: 'token',
            short: 'API令牌'
          },
          {
            name: '⏭️  跳过认证 (使用临时模式)',
            value: 'skip',
            short: '跳过认证'
          }
        ],
        default: 'browser'
      }
    ]);

    switch (authChoice) {
      case 'browser':
        await this.performBrowserLogin();
        break;
      
      case 'token':
        await this.performTokenLogin();
        break;
      
      case 'skip':
        this.logger.logDebug('用户选择跳过认证');
        // 设置跳过认证标志，强制使用快速隧道
        this.operationContext.userSkippedAuth = true;
        break;
    }
  }

  /**
   * 执行浏览器登录
   */
  async performBrowserLogin() {
    console.log('\n' + chalk.yellow('正在启动浏览器登录...'));
    console.log('浏览器将自动打开，请完成登录后返回终端。\n');

    try {
      // 执行cloudflared tunnel login
      await this.runCloudflaredLogin();
      
      // 验证登录结果
      const hasAuth = await this.configManager.checkCertPem();
      if (hasAuth) {
        console.log(chalk.green('✅ 浏览器登录成功！'));
        
        // 登录成功后让用户选择域名
        await this.chooseDomainAfterLogin();
      } else {
        throw new Error('登录验证失败，cert.pem文件未找到');
      }

    } catch (error) {
      console.log(chalk.red('❌ 浏览器登录失败'));
      throw error;
    }
  }

  /**
   * 执行cloudflared登录命令
   */
  async runCloudflaredLogin() {
    return new Promise((resolve, reject) => {
      const child = spawn('cloudflared', ['tunnel', 'login'], {
        stdio: 'inherit'
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`cloudflared登录失败，退出代码: ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`无法启动cloudflared: ${error.message}`));
      });
    });
  }

  /**
   * 执行API令牌登录
   */
  async performTokenLogin() {
    console.log('\n' + chalk.yellow('API令牌认证'));
    console.log('您可以从 Cloudflare Dashboard > My Profile > API Tokens 获取令牌。\n');

    const { apiToken } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiToken',
        message: '请输入API令牌:',
        mask: '*',
        validate: (input) => {
          if (!input || input.trim().length < 10) {
            return '请输入有效的API令牌';
          }
          return true;
        }
      }
    ]);

    try {
      await this.configManager.setApiToken(apiToken.trim());
      console.log(chalk.green('✅ API令牌设置成功！'));
    } catch (error) {
      console.log(chalk.red('❌ API令牌设置失败'));
      throw error;
    }
  }

  /**
   * 登录成功后选择域名
   */
  async chooseDomainAfterLogin() {
    console.log('\n' + chalk.blue('🌐 域名选择'));
    console.log('请选择要使用的域名配置方式:\n');

    try {
      // 获取用户DNS区域信息
      const zones = await this.configManager.getCloudflareZones();
      const choices = [];

      // 添加DNS区域选项
      if (zones && zones.length > 0) {
        console.log(chalk.gray('📋 您的DNS区域:'));
        zones.forEach((zone, index) => {
          console.log(`   ${index + 1}. ${zone.name} (${zone.status})`);
          choices.push({
            name: `🌍 使用 ${zone.name} 域名`,
            value: { type: 'zone', zone: zone },
            short: zone.name
          });
        });
        console.log();
      } else {
        console.log(chalk.gray('💡 提示: 若要显示您的DNS区域列表，需要API令牌'));
        console.log(chalk.gray('   您仍可以直接输入自定义域名或使用自动生成前缀\n'));
      }

      // 添加其他选项
      choices.push(
        {
          name: '✏️  输入自定义域名',
          value: { type: 'custom' },
          short: '自定义域名'
        },
        {
          name: '🎲 使用自动生成域名前缀',
          value: { type: 'auto' },
          short: '自动生成'
        }
      );

      const { domainChoice } = await inquirer.prompt([
        {
          type: 'list',
          name: 'domainChoice',
          message: '选择域名配置:',
          choices: choices,
          pageSize: 10
        }
      ]);

      await this.processDomainChoice(domainChoice);

    } catch (error) {
      this.logger.logWarning('域名选择失败', error.message);
      console.log(chalk.yellow('⚠️  域名选择失败，将使用默认配置'));
    }
  }

  /**
   * 处理域名选择结果
   * @param {Object} choice - 用户选择
   */
  async processDomainChoice(choice) {
    switch (choice.type) {
      case 'zone':
        await this.handleZoneDomainChoice(choice.zone);
        break;

      case 'custom':
        await this.handleCustomDomainChoice();
        break;

      case 'auto':
        await this.handleAutoDomainChoice();
        break;

      default:
        this.logger.logWarning('未知域名选择类型', choice.type);
    }
  }

  /**
   * 处理DNS区域域名选择
   * @param {Object} zone - DNS区域
   */
  async handleZoneDomainChoice(zone) {
    const { subdomain } = await inquirer.prompt([
      {
        type: 'input',
        name: 'subdomain',
        message: `请输入子域名前缀 (将创建 subdomain.${zone.name}):`,
        default: `proxy-${Date.now().toString(36)}`,
        validate: (input) => {
          if (!input || !/^[a-zA-Z0-9-]+$/.test(input)) {
            return '子域名前缀只能包含字母、数字和短横线';
          }
          if (input.length > 63) {
            return '子域名前缀不能超过63个字符';
          }
          return true;
        }
      }
    ]);

    const fullDomain = `${subdomain}.${zone.name}`;
    
    // 存储选择的域名配置
    this.operationContext.selectedDomain = {
      type: 'zone',
      zone: zone,
      subdomain: subdomain,
      fullDomain: fullDomain
    };

    console.log(chalk.green(`✅ 已选择域名: ${chalk.cyan(fullDomain)}`));
    this.logger.logDebug('用户选择DNS区域域名', this.operationContext.selectedDomain);
  }

  /**
   * 处理自定义域名选择
   */
  async handleCustomDomainChoice() {
    const { customDomain } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customDomain',
        message: '请输入完整的自定义域名:',
        validate: (input) => {
          if (!input) {
            return '请输入域名';
          }
          
          // 简单的域名格式验证
          const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
          if (!domainRegex.test(input)) {
            return '请输入有效的域名格式 (例如: example.com 或 sub.example.com)';
          }
          
          return true;
        }
      }
    ]);

    // 存储选择的域名配置
    this.operationContext.selectedDomain = {
      type: 'custom',
      fullDomain: customDomain.trim()
    };

    console.log(chalk.green(`✅ 已选择自定义域名: ${chalk.cyan(customDomain)}`));
    console.log(chalk.yellow('💡 请确保该域名已指向Cloudflare DNS'));
    this.logger.logDebug('用户选择自定义域名', this.operationContext.selectedDomain);
  }

  /**
   * 处理自动域名选择
   */
  async handleAutoDomainChoice() {
    const autoPrefix = `proxy-${Date.now().toString(36)}`;
    
    // 存储选择的域名配置
    this.operationContext.selectedDomain = {
      type: 'auto',
      prefix: autoPrefix
    };

    console.log(chalk.green(`✅ 已设置自动生成前缀: ${chalk.cyan(autoPrefix)}`));
    console.log(chalk.gray('   系统将自动选择合适的域名后缀'));
    this.logger.logDebug('用户选择自动域名生成', this.operationContext.selectedDomain);
  }

  /**
   * 创建隧道
   * @param {number} port - 本地端口
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 隧道结果
   */
  async createTunnel(port, options) {
    this.currentStep = '隧道创建';
    this.logger.logStep('隧道创建', '开始创建隧道', { port, options });

    try {
      // 初始化隧道管理器
      if (!this.tunnelLifecycle) {
        this.tunnelLifecycle = new TunnelLifecycle(this.configManager);
      }

      // 决定隧道类型
      const hasAuth = await this.configManager.checkCertPem();
      let customDomain = options.domain || process.env.UVX_CUSTOM_DOMAIN;
      
      // 检查是否强制跳过认证（程序选项或用户交互选择）
      const forceQuickTunnel = options.skipAuth === true || this.operationContext.userSkippedAuth === true;
      
      this.logger.logDebug('隧道类型决策', {
        hasAuth,
        'options.skipAuth': options.skipAuth,
        'userSkippedAuth': this.operationContext.userSkippedAuth,
        forceQuickTunnel
      });

      let tunnelResult;
      
      if (hasAuth && !forceQuickTunnel) {
        // 使用用户选择的域名配置
        customDomain = this.getDomainFromUserChoice(customDomain);
        
        // 创建命名隧道
        this.logger.logStep('隧道模式', '使用命名隧道模式（认证）', { domain: customDomain });
        
        const tunnelName = this.generateTunnelName(customDomain);
        tunnelResult = await this.tunnelLifecycle.createNamedTunnel(tunnelName, customDomain, port);
        tunnelResult.needsDns = true;
      } else {
        // 为匿名用户创建临时命名隧道，使用自动生成的子域名
        const reason = forceQuickTunnel ? '用户选择跳过认证' : '无认证凭据';
        this.logger.logStep('隧道模式', `使用临时命名隧道模式（${reason}）`);
        
        try {
          // 尝试创建临时命名隧道
          const tempDomain = await this.generateTempDomainForAnonymous();
          if (tempDomain) {
            this.logger.logStep('临时域名', `生成临时域名: ${tempDomain}`);
            
            const tunnelName = this.generateTunnelName(tempDomain);
            tunnelResult = await this.tunnelLifecycle.createNamedTunnel(tunnelName, tempDomain, port);
            tunnelResult.needsDns = true;
            tunnelResult.isTemporary = true;
          } else {
            // 回退到快速隧道
            this.logger.logStep('临时域名', '无法生成临时域名，回退到快速隧道');
            tunnelResult = await this.tunnelLifecycle.createQuickTunnel(port);
            tunnelResult.needsDns = false;
          }
        } catch (tempError) {
          this.logger.logDebug('临时隧道创建失败', tempError.message);
          this.logger.logStep('隧道模式', '临时隧道创建失败，回退到快速隧道');
          
          // 回退到快速隧道
          tunnelResult = await this.tunnelLifecycle.createQuickTunnel(port);
          tunnelResult.needsDns = false;
        }
      }

      this.logger.logStep('隧道创建', '隧道创建成功', tunnelResult);
      return tunnelResult;

    } catch (error) {
      this.logger.logError('隧道创建失败', error);
      const handledError = this.errorHandler.handleError(error, { 
        phase: '隧道创建', 
        step: this.currentStep,
        port
      });
      throw new Error(handledError.originalError || handledError.displayMessage || '隧道创建失败');
    }
  }

  /**
   * 根据用户选择获取域名
   * @param {string} fallbackDomain - 备用域名
   * @returns {string} 最终使用的域名
   */
  getDomainFromUserChoice(fallbackDomain) {
    if (!this.operationContext.selectedDomain) {
      // 如果用户没有选择域名，使用备用方案
      if (fallbackDomain) {
        return fallbackDomain;
      }
      // 生成默认域名前缀
      return `uvx-${Date.now().toString().slice(-8)}`;
    }

    const selected = this.operationContext.selectedDomain;
    
    switch (selected.type) {
      case 'zone':
      case 'custom':
        return selected.fullDomain;
      
      case 'auto':
        return selected.prefix;
      
      default:
        this.logger.logWarning('未知域名选择类型', selected.type);
        return fallbackDomain || `uvx-${Date.now().toString().slice(-8)}`;
    }
  }

  /**
   * 配置DNS
   * @param {Object} tunnelResult - 隧道结果
   * @returns {Promise<Object>} DNS配置结果
   */
  async configureDns(tunnelResult) {
    this.currentStep = 'DNS配置';
    this.logger.logStep('DNS配置', '开始DNS配置', tunnelResult);

    try {
      // 初始化DNS管理器
      if (!this.dnsManager) {
        this.dnsManager = new DNSManager(this.configManager);
      }

      const dnsResult = await this.dnsManager.configureDNS(
        tunnelResult.tunnelId,
        tunnelResult.domain
      );

      this.logger.logStep('DNS配置', 'DNS配置成功', dnsResult);
      return dnsResult;

    } catch (error) {
      this.logger.logError('DNS配置失败', error);
      const handledError = this.errorHandler.handleError(error, { 
        phase: 'DNS配置', 
        step: this.currentStep,
        tunnelId: tunnelResult.tunnelId,
        domain: tunnelResult.domain
      });
      throw new Error(handledError.originalError || handledError.displayMessage || 'DNS配置失败');
    }
  }

  /**
   * 执行最终验证
   * @param {Object} tunnelResult - 隧道结果
   * @param {Object} dnsResult - DNS结果
   * @returns {Promise<Object>} 验证结果
   */
  async performFinalValidation(tunnelResult, dnsResult) {
    this.currentStep = '最终验证';
    this.logger.logStep('最终验证', '开始最终验证');

    try {
      const validationResult = {
        tunnelHealthy: false,
        dnsResolved: false,
        endToEndWorking: false,
        finalUrl: null
      };

      // 验证隧道健康状态
      const tunnelStatus = this.tunnelLifecycle.getStatus();
      validationResult.tunnelHealthy = tunnelStatus.processStatus === 'running';

      // 验证DNS解析（如果有DNS配置）
      if (dnsResult) {
        validationResult.dnsResolved = await this.dnsManager.verifyDnsRecord(
          tunnelResult.domain,
          `${tunnelResult.tunnelId}.cfargotunnel.com`
        );
        validationResult.finalUrl = `https://${tunnelResult.domain}`;
      } else {
        validationResult.dnsResolved = true; // 快速隧道不需要DNS
        validationResult.finalUrl = tunnelResult.url;
      }

      // 端到端连接测试（可选）
      if (validationResult.tunnelHealthy && validationResult.dnsResolved) {
        validationResult.endToEndWorking = await this.testEndToEndConnection(
          validationResult.finalUrl
        );
      }

      this.logger.logStep('最终验证', '验证完成', validationResult);
      return validationResult;

    } catch (error) {
      this.logger.logWarning('最终验证失败', error.message);
      // 验证失败不应该中断整个流程
      return {
        tunnelHealthy: false,
        dnsResolved: false,
        endToEndWorking: false,
        finalUrl: tunnelResult.url,
        error: error.message
      };
    }
  }

  /**
   * 测试端到端连接
   * @param {string} url - 测试URL
   * @returns {Promise<boolean>} 连接是否正常
   */
  async testEndToEndConnection(url) {
    try {
      // 简单的HTTP连接测试
      const testUrl = new URL('/__health__', url);
      const response = await fetch(testUrl.toString(), {
        timeout: 5000,
        method: 'HEAD'
      });
      
      // 任何响应（包括404）都表示连接正常
      return response.status >= 200 && response.status < 600;

    } catch (error) {
      this.logger.logDebug('端到端测试失败', { url, error: error.message });
      return false;
    }
  }

  /**
   * 处理操作错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   * @returns {Promise<Object>} 错误处理结果
   */
  async handleOperationError(error, context) {
    this.logger.logError('操作失败', error, context);

    const errorResponse = this.errorHandler.handleError(error, {
      ...context,
      phase: this.currentStep,
      sessionId: this.sessionId,
      operation: '一键代理'
    });

    // 显示错误信息
    this.errorHandler.displayError(errorResponse);

    // 尝试自动恢复
    if (errorResponse.autoFix && this.errorHandler.canAutoRecover(error.type)) {
      console.log('\n' + chalk.yellow('🔧 尝试自动恢复...'));
      
      try {
        const recoveryResult = await this.attemptAutoRecovery(errorResponse);
        if (recoveryResult.success) {
          console.log(chalk.green('✅ 自动恢复成功，继续操作...'));
          // 可以选择重新尝试操作
        }
      } catch (recoveryError) {
        console.log(chalk.red('❌ 自动恢复失败'));
      }
    }

    return {
      success: false,
      error: errorResponse,
      sessionId: this.sessionId,
      duration: Date.now() - context.startTime
    };
  }

  /**
   * 尝试自动恢复
   * @param {Object} errorResponse - 错误响应
   * @returns {Promise<Object>} 恢复结果
   */
  async attemptAutoRecovery(errorResponse) {
    // 这里可以根据错误类型实现具体的自动恢复逻辑
    // 目前返回基本的恢复结果
    return {
      success: false,
      message: '自动恢复功能正在开发中'
    };
  }

  /**
   * 显示成功消息
   * @param {Object} result - 操作结果
   */
  displaySuccessMessage(result) {
    console.log('\n' + chalk.green('🎉 代理创建成功！'));
    
    console.log('\n📊 连接信息:');
    console.log(`   🌍 公网访问地址: ${chalk.cyan(result.url)}`);
    console.log(`   🏠 本地服务地址: http://localhost:${result.tunnel.port}`);
    
    if (result.tunnel.type === 'named') {
      console.log(`   🚇 隧道名称: ${result.tunnel.tunnelName}`);
      console.log(`   🆔 隧道ID: ${result.tunnel.tunnelId}`);
    }

    if (result.dns) {
      console.log(`   🌐 DNS方式: ${result.dns.method}`);
    }

    console.log(`   ⏱️  总耗时: ${Math.round(result.duration / 1000)}秒`);
    
    console.log('\n💡 使用提示:');
    console.log('   • 按 Ctrl+C 停止代理');
    console.log('   • 代理将保持运行直到手动停止');
    
    if (result.tunnel.type === 'quick' || result.tunnel.type === 'temp') {
      console.log('   • 使用临时域名，重启后域名会变化');
      console.log('   • 若需固定域名，请先进行认证');
    }
  }

  /**
   * 为匿名用户生成临时域名
   * @returns {Promise<string|null>} 临时域名或null（如果无法生成）
   */
  async generateTempDomainForAnonymous() {
    try {
      // 尝试获取用户的可用域名
      const zones = await this.configManager.getCloudflareZones();
      
      if (zones && zones.length > 0) {
        // 使用第一个可用域名作为基础
        const baseZone = zones[0];
        
        // 生成随机子域名前缀
        const randomPrefix = this.generateRandomSubdomain();
        const tempDomain = `${randomPrefix}.${baseZone.name}`;
        
        this.logger.logDebug('临时域名生成', `基础域名: ${baseZone.name}, 临时域名: ${tempDomain}`);
        return tempDomain;
      }
      
      // 如果无法获取用户域名，使用默认域名（如果有的话）
      const defaultDomain = this.configManager.getDefaultDomain?.();
      if (defaultDomain) {
        const randomPrefix = this.generateRandomSubdomain();
        const tempDomain = `${randomPrefix}.${defaultDomain}`;
        
        this.logger.logDebug('临时域名生成', `使用默认域名: ${defaultDomain}, 临时域名: ${tempDomain}`);
        return tempDomain;
      }
      
      this.logger.logDebug('临时域名生成', '无可用域名，无法生成临时域名');
      return null;
      
    } catch (error) {
      this.logger.logDebug('临时域名生成失败', error.message);
      return null;
    }
  }

  /**
   * 生成随机子域名前缀
   * @returns {string} 随机子域名前缀
   */
  generateRandomSubdomain() {
    const adjectives = ['quick', 'temp', 'fast', 'rapid', 'swift', 'auto', 'instant', 'dynamic'];
    const nouns = ['tunnel', 'proxy', 'bridge', 'link', 'connect', 'access', 'gateway', 'portal'];
    
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const timestamp = Date.now().toString(36).slice(-4);
    
    return `${adjective}-${noun}-${timestamp}`;
  }

  /**
   * 生成隧道名称
   * @param {string} domain - 域名
   * @returns {string} 隧道名称
   */
  generateTunnelName(domain) {
    const timestamp = Date.now().toString(36);
    const sanitizedDomain = domain.replace(/[^a-zA-Z0-9]/g, '-');
    return `proxy-${sanitizedDomain}-${timestamp}`.toLowerCase();
  }

  /**
   * 生成会话ID
   * @returns {string} 会话ID
   */
  generateSessionId() {
    return `v2_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * 获取操作状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      currentStep: this.currentStep,
      context: this.operationContext,
      modules: {
        configManager: this.configManager ? 'initialized' : 'not_initialized',
        tunnelLifecycle: this.tunnelLifecycle ? 'initialized' : 'not_initialized',
        dnsManager: this.dnsManager ? 'initialized' : 'not_initialized'
      }
    };
  }

  /**
   * 清理资源
   */
  async cleanup() {
    this.logger.logStep('清理资源', '开始清理会话资源');

    try {
      if (this.tunnelLifecycle) {
        await this.tunnelLifecycle.cleanup();
      }

      // 清理错误处理器的过期数据
      this.errorHandler.cleanupOldErrors();

      this.logger.logStep('清理完成', '会话资源清理成功');

    } catch (error) {
      this.logger.logWarning('清理失败', error.message);
    }
  }
}