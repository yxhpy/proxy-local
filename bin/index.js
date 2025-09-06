#!/usr/bin/env node

import { Command } from 'commander';
import { ProviderManager, CloudflareProvider, PinggyProvider, LocalTunnelProvider, ServeoProvider } from '../src/providers/index.js';
import { formatter } from '../src/utils/output-formatter.js';
import { configLoader } from '../src/config/index.js';

const program = new Command();

// 初始化提供商管理器
const manager = new ProviderManager();

// 注册提供商（按优先级：Cloudflare 为默认，其他作为备选）
manager.register(new CloudflareProvider(), true); // 默认：Cloudflare 临时模式，无需登录
manager.register(new PinggyProvider()); // 备选：无确认页面
manager.register(new ServeoProvider()); // 备选：SSH 隧道，无确认页面  
manager.register(new LocalTunnelProvider()); // 备选：经典方案

// 配置主程序
program
  .name('uvx-proxy-local')
  .description('多提供商内网穿透 CLI 工具')
  .version('3.2.0')
  .argument('[port]', 'Local port to proxy')
  .option('-p, --provider <name>', 'Specify a tunnel provider (pinggy, localtunnel, serveo, cloudflare)')
  .option('--list-providers', 'List all available providers with features')
  .option('--show-config', 'Show current configuration settings')
  .option('--cloudflare-login', 'Login to Cloudflare account for persistent tunnels')
  .option('--cloudflare-logout', 'Logout from Cloudflare account')
  .option('--cloudflare-custom <name>', 'Use custom Cloudflare tunnel name')
  .option('--timeout <ms>', 'Connection timeout in milliseconds')
  .option('--retries <n>', 'Number of retry attempts')
  .option('--verbose', 'Enable verbose output')
  .option('--no-colors', 'Disable colored output')
  .option('--no-icons', 'Disable icon display')
  .action(async (port, options) => {
    // 加载配置 (CLI 参数会覆盖配置文件和环境变量)
    const cliConfig = {
      defaultProvider: options.provider,
      timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
      retries: options.retries ? parseInt(options.retries, 10) : undefined,
      ui: {
        verbose: options.verbose,
        colors: !options.noColors,
        icons: !options.noIcons
      }
    };
    
    const config = configLoader.loadConfig(cliConfig);
    
    // 验证配置
    const configErrors = configLoader.validateConfig(config);
    if (configErrors.length > 0) {
      console.error(formatter.formatError('配置错误:', configErrors));
      process.exit(1);
    }
    
    // 显示配置信息（如果请求）
    if (options.showConfig) {
      console.log(formatter.formatTitle('当前配置'));
      console.log(JSON.stringify(config, null, 2));
      console.log('');
      console.log(formatter.formatInfo('配置来源优先级: CLI 参数 > 环境变量 > 用户配置文件 > 项目配置文件 > 默认值'));
      console.log('');
      console.log(formatter.formatInfo('支持的环境变量:'));
      console.log('  UVX_PROVIDER - 默认提供商');
      console.log('  UVX_TIMEOUT - 连接超时时间（毫秒）');
      console.log('  UVX_RETRIES - 重试次数');
      console.log('  UVX_CLOUDFLARE_TOKEN - Cloudflare 认证令牌');
      console.log('  UVX_VERBOSE - 详细输出 (true/false)');
      console.log('  UVX_NO_COLORS - 禁用颜色 (true/false)');
      console.log('  UVX_NO_ICONS - 禁用图标 (true/false)');
      return;
    }
    
    // 处理 Cloudflare 特定命令
    if (options.cloudflareLogin) {
      try {
        const cloudflareProvider = manager.getProvider('cloudflare');
        if (!cloudflareProvider) {
          console.error('❌ Cloudflare 提供商未注册');
          process.exit(1);
        }
        
        await cloudflareProvider.login();
        
        // 保存认证信息到用户配置
        const authSuccess = configLoader.saveCloudflareAuth({
          authToken: 'authenticated',  // 占位符，实际令牌由 cloudflared 管理
          tempMode: false
        });
        
        if (!authSuccess) {
          console.warn(formatter.formatWarning('警告: 无法保存认证状态到配置文件'));
        }
        
        console.log(formatter.formatAuthMessage('login', '现在您可以使用持久模式创建隧道！'));
        console.log(formatter.formatInfo('例如: uvx-proxy-local 8000 --provider=cloudflare (将自动检测并使用持久模式)'));
        console.log(formatter.formatInfo('或使用自定义名称: uvx-proxy-local 8000 --cloudflare-custom=myapp'));
      } catch (error) {
        console.error(`❌ 登录失败: ${error.message}`);
        process.exit(1);
      }
      return;
    }

    if (options.cloudflareLogout) {
      try {
        const cloudflareProvider = manager.getProvider('cloudflare');
        if (!cloudflareProvider) {
          console.error('❌ Cloudflare 提供商未注册');
          process.exit(1);
        }
        
        await cloudflareProvider.logout();
        
        // 清除配置中的认证信息
        const clearSuccess = configLoader.clearCloudflareAuth();
        if (!clearSuccess) {
          console.warn(formatter.formatWarning('警告: 无法清除配置文件中的认证信息'));
        }
        
        console.log(formatter.formatAuthMessage('logout', '您现在将使用临时模式创建隧道'));
      } catch (error) {
        console.error(`❌ 登出失败: ${error.message}`);
        process.exit(1);
      }
      return;
    }

    // 如果用户只是想列出提供商
    if (options.listProviders) {
      const providers = manager.listProvidersInfo();
      
      if (providers.length === 0) {
        console.log(formatter.formatWarning('没有注册的提供商'));
        return;
      }

      console.log(formatter.formatProvidersList(providers));
      console.log(formatter.formatUsageExamples(providers.find(p => p.isDefault)?.name));
      return;
    }

    // 验证 provider 选项（如果提供的话）
    if (options.provider) {
      const availableProviders = ['pinggy', 'localtunnel', 'serveo', 'cloudflare'];
      if (!availableProviders.includes(options.provider.toLowerCase())) {
        console.error(`❌ 错误: 未知的提供商 "${options.provider}"`);
        console.log(`可用的提供商: ${availableProviders.join(', ')}`);
        console.log('运行 --list-providers 查看详细信息');
        process.exit(1);
      }
    }

    // 处理 Cloudflare 自定义隧道名称
    if (options.cloudflareCustom) {
      if (options.provider && options.provider !== 'cloudflare') {
        console.error('❌ 错误: --cloudflare-custom 只能与 --provider=cloudflare 一起使用');
        process.exit(1);
      }
      options.provider = 'cloudflare'; // 强制使用 Cloudflare
      console.log(`🎯 使用自定义 Cloudflare 隧道名称: ${options.cloudflareCustom}`);
    }

    // 检查端口是否提供
    if (!port) {
      console.error('❌ 错误: 请提供端口号。');
      console.log('使用方法: npx uvx-proxy-local <port>');
      console.log('或查看帮助: npx uvx-proxy-local --help');
      process.exit(1);
    }

    // 验证端口号
    const portNumber = parseInt(port, 10);
    if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
      console.error('❌ 错误: 端口必须是 1-65535 之间的有效数字。');
      process.exit(1);
    }

    // 确定要使用的提供商 (优先级: CLI参数 > 配置文件 > 默认)
    const selectedProvider = options.provider || config.defaultProvider;
    
    if (config.ui.verbose) {
      console.log(formatter.formatInfo(`使用提供商: ${selectedProvider} ${options.provider ? '(CLI指定)' : '(配置默认)'}`));
    }
    
    // 检查并设置 Cloudflare 认证模式
    if (selectedProvider === 'cloudflare' || (!selectedProvider && config.defaultProvider === 'cloudflare')) {
      const cloudflareProvider = manager.getProvider('cloudflare');
      if (cloudflareProvider) {
        try {
          const isAuthenticated = await cloudflareProvider.isAuthenticated();
          
          if (options.cloudflareCustom) {
            // 使用自定义名称时强制要求认证
            if (!isAuthenticated) {
              console.error('❌ 自定义隧道名称需要登录 Cloudflare 账户');
              console.log('请先运行: uvx-proxy-local --cloudflare-login');
              process.exit(1);
            }
            cloudflareProvider.setAuthMode(true, options.cloudflareCustom);
            console.log(`🎯 将使用自定义隧道名称: ${options.cloudflareCustom}`);
          } else if (isAuthenticated && !options.provider) {
            // 如果已认证且没有指定提供商，提示用户可以使用持久模式
            console.log('ℹ️  检测到您已登录 Cloudflare，将使用持久模式');
            cloudflareProvider.setAuthMode(true);
          } else if (isAuthenticated && options.provider === 'cloudflare') {
            // 明确指定 cloudflare 且已认证，使用持久模式
            cloudflareProvider.setAuthMode(true);
          } else {
            // 使用临时模式
            cloudflareProvider.setAuthMode(false);
            if (!isAuthenticated) {
              console.log('ℹ️  使用临时模式 (无需登录)');
              console.log('💡 提示: 运行 --cloudflare-login 可获得固定域名的持久隧道');
            }
          }
        } catch (error) {
          console.warn(`⚠️  检查认证状态失败: ${error.message}`);
          // 继续使用临时模式
          cloudflareProvider.setAuthMode(false);
        }
      }
    }
    
    try {
      // 使用智能回退创建隧道 (应用配置的超时和重试设置)
      const result = await manager.createTunnelWithFallback(portNumber, selectedProvider, {
        timeout: config.timeout,
        retries: config.retries
      });
      
      // 显示成功信息 - 使用新的格式化器
      const provider = manager.getCurrentProvider();
      const features = provider.getFeatures();
      
      console.log(formatter.formatTunnelSuccess(result, provider, features));
      
      // 监听退出信号来清理隧道
      process.on('SIGINT', async () => {
        console.log(formatter.formatTunnelClosing());
        try {
          await provider.closeTunnel();
          console.log(formatter.formatTunnelClosed());
        } catch (error) {
          console.log(formatter.formatWarning(`隧道关闭时出现警告: ${error.message}`));
        }
        process.exit(0);
      });
      
    } catch (error) {
      let suggestions = [];
      
      // 如果是所有提供商都失败，给出更详细的帮助信息
      if (error.message.includes('All tunnel providers failed')) {
        suggestions = [
          `检查端口 ${portNumber} 上是否有服务在运行`,
          '确保网络连接正常',
          '尝试使用不同的端口号',
          '查看可用的提供商: npx uvx-proxy-local --list-providers'
        ];
      }
      
      console.log(formatter.formatError(`隧道创建失败: ${error.message}`, suggestions));
      process.exit(1);
    }
  });

program.parse(process.argv);