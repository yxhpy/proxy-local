#!/usr/bin/env node

import { Command } from 'commander';
import { ProviderManager, CloudflareProvider, PinggyProvider, LocalTunnelProvider, ServeoProvider } from '../src/providers/index.js';
import { CloudflareV2Provider } from '../src/v2/cloudflare-v2-provider.js';
import { createV2Proxy } from '../src/v2/index.js';
import { formatter } from '../src/utils/output-formatter.js';
import { configLoader } from '../src/config/index.js';
import { processManager } from '../src/utils/process-manager.js';
import { interactiveProcessManager } from '../src/utils/interactive-process-manager.js';

const program = new Command();

// 初始化提供商管理器
const manager = new ProviderManager();

// 注册提供商（按优先级：Cloudflare 为默认，其他作为备选）
manager.register(new CloudflareProvider(), true); // 默认：Cloudflare 临时模式，无需登录
manager.register(new CloudflareV2Provider(), false); // V2：Cloudflare 一键代理，新架构
manager.register(new PinggyProvider()); // 备选：无确认页面
manager.register(new ServeoProvider()); // 备选：SSH 隧道，无确认页面  
manager.register(new LocalTunnelProvider()); // 备选：经典方案

// 配置主程序
program
  .name('uvx-proxy-local')
  .description('多提供商内网穿透 CLI 工具')
  .version('3.5.0')
  .argument('[port]', 'Local port to proxy')
  .option('-p, --provider <name>', 'Specify a tunnel provider (pinggy, localtunnel, serveo, cloudflare, cloudflare-v2)')
  .option('--list-providers', 'List all available providers with features')
  .option('--show-config', 'Show current configuration settings')
  .option('--cloudflare-login', 'Login to Cloudflare account for persistent tunnels')
  .option('--cloudflare-logout', 'Logout from Cloudflare account')
  .option('--cloudflare-custom <name>', 'Use custom Cloudflare tunnel name')
  .option('--skip-auth', 'Skip authentication and use quick tunnel (cloudflare-v2 only)')
  .option('--reset-domain', 'Reset fixed domain configuration and show domain selection menu')
  .option('--timeout <ms>', 'Connection timeout in milliseconds')
  .option('--retries <n>', 'Number of retry attempts')
  .option('--verbose', 'Enable verbose output')
  .option('--no-colors', 'Disable colored output')
  .option('--no-icons', 'Disable icon display')
  .option('-d, --daemon', 'Run proxy in background/daemon mode')
  .option('--list', 'List all running proxy processes')
  .option('--kill [pid]', 'Kill a specific proxy process by PID, or show interactive menu if no PID provided')
  .option('--kill-all', 'Kill all running proxy processes')
  .option('--status', 'Show detailed status of all running processes')
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

    // 处理域名重置命令
    if (options.resetDomain) {
      try {
        const cloudflareProvider = manager.getProvider('cloudflare');
        if (!cloudflareProvider) {
          console.error('❌ Cloudflare 提供商未注册');
          process.exit(1);
        }
        
        cloudflareProvider.resetDomainConfiguration();
        console.log('💡 下次使用 Cloudflare 时将重新显示域名选择菜单');
        return;
      } catch (error) {
        console.error(`❌ 重置域名配置失败: ${error.message}`);
        process.exit(1);
      }
    }

    // 处理进程管理命令
    if (options.list) {
      const runningProcesses = processManager.getRunningProcesses();
      if (runningProcesses.length === 0) {
        console.log(formatter.formatInfo('没有运行中的代理进程'));
        return;
      }
      
      console.log(formatter.formatTitle('运行中的代理进程'));
      console.table(runningProcesses.map(proc => ({
        PID: proc.pid,
        Port: proc.port,
        Provider: proc.provider,
        URL: proc.url,
        'Start Time': new Date(proc.startTime).toLocaleString(),
        Status: proc.status
      })));
      
      const stats = processManager.getProcessStats();
      console.log(formatter.formatInfo(`总计: ${stats.total} 个进程`));
      return;
    }

    if (options.kill !== undefined) {
      // 检查是否提供了 PID
      if (typeof options.kill === 'string') {
        // 直接终止指定的 PID
        const pid = parseInt(options.kill, 10);
        if (isNaN(pid)) {
          console.error('❌ 错误: PID 必须是有效数字');
          process.exit(1);
        }
        
        console.log(`🔄 正在终止进程 PID ${pid}...`);
        const result = await processManager.killProcess(pid);
        
        if (result.success) {
          console.log(formatter.formatSuccess(result.message));
        } else {
          console.log(formatter.formatError(result.message));
          process.exit(1);
        }
      } else {
        // 启动交互式菜单（当 options.kill 为 true 时）
        console.log(formatter.formatTitle('交互式进程终止'));
        const result = await interactiveProcessManager.showKillMenu();
        
        if (result.cancelled) {
          console.log(formatter.formatInfo('操作已取消'));
        } else if (result.error) {
          console.log(formatter.formatError(result.error));
          process.exit(1);
        } else if (result.success) {
          console.log(formatter.formatSuccess(`成功终止 ${result.killedProcesses} 个进程`));
        }
      }
      return;
    }

    if (options.killAll) {
      const runningProcesses = processManager.getRunningProcesses();
      if (runningProcesses.length === 0) {
        console.log(formatter.formatInfo('没有运行中的代理进程'));
        return;
      }
      
      console.log(`🔄 正在终止所有 ${runningProcesses.length} 个代理进程...`);
      let success = 0;
      let failed = 0;
      
      for (const proc of runningProcesses) {
        const result = await processManager.killProcess(proc.pid);
        if (result.success) {
          success++;
        } else {
          failed++;
        }
      }
      
      console.log(formatter.formatInfo(`完成: ${success} 个成功终止, ${failed} 个失败`));
      return;
    }

    if (options.status) {
      const runningProcesses = processManager.getRunningProcesses();
      const stats = processManager.getProcessStats();
      
      console.log(formatter.formatTitle('代理进程状态报告'));
      
      if (runningProcesses.length === 0) {
        console.log(formatter.formatInfo('没有运行中的代理进程'));
      } else {
        console.table(runningProcesses.map(proc => ({
          PID: proc.pid,
          Port: proc.port,
          Provider: proc.provider,
          URL: proc.url,
          'Start Time': new Date(proc.startTime).toLocaleString(),
          'Running Time': Math.round((Date.now() - new Date(proc.startTime)) / 1000) + 's'
        })));
        
        console.log('\n📊 统计信息:');
        console.log(`总进程数: ${stats.total}`);
        Object.entries(stats.byProvider).forEach(([provider, count]) => {
          console.log(`${provider}: ${count} 个进程`);
        });
        
        if (stats.oldestStart) {
          console.log(`最早启动: ${stats.oldestStart.toLocaleString()}`);
        }
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
      const availableProviders = ['pinggy', 'localtunnel', 'serveo', 'cloudflare', 'cloudflare-v2'];
      if (!availableProviders.includes(options.provider.toLowerCase())) {
        console.error(`❌ 错误: 未知的提供商 "${options.provider}"`);
        console.log(`可用的提供商: ${availableProviders.join(', ')}`);
        console.log('运行 --list-providers 查看详细信息');
        process.exit(1);
      }
    }

    // 处理 Cloudflare 自定义隧道名称
    if (options.cloudflareCustom) {
      if (options.provider && !['cloudflare', 'cloudflare-v2'].includes(options.provider)) {
        console.error('❌ 错误: --cloudflare-custom 只能与 --provider=cloudflare 或 --provider=cloudflare-v2 一起使用');
        process.exit(1);
      }
      // 如果没有指定provider，默认使用V2
      if (!options.provider) {
        options.provider = 'cloudflare-v2';
      }
      console.log(`🎯 使用自定义 Cloudflare 域名: ${options.cloudflareCustom}`);
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

    // 处理 Cloudflare V2 一键代理
    if (selectedProvider === 'cloudflare-v2') {
      console.log('🚀 启动 Cloudflare V2 一键代理...');
      
      try {
        const v2Result = await createV2Proxy(portNumber, {
          interactive: !options.daemon,
          daemon: options.daemon,
          verbose: config.ui.verbose,
          domain: options.cloudflareCustom,  // 修正参数名称
          resetDomain: options.resetDomain,
          skipAuth: options.skipAuth
        });

        // 检查V2代理是否成功创建
        if (!v2Result.success) {
          const errorMessage = v2Result.error?.displayMessage || v2Result.error?.originalError || 'V2代理创建失败';
          console.error(`❌ ${errorMessage}`);
          process.exit(1);
        }

        if (options.daemon) {
          // 后台模式
          const processInfo = processManager.addProcess({
            pid: process.pid,
            port: portNumber,
            url: v2Result.url,
            provider: 'cloudflare-v2',
            originalUrl: v2Result.url,
            features: ['dns-auto-config', 'one-click', 'persistent']
          });

          if (processInfo) {
            console.log('✅ V2一键代理后台启动成功!');
            console.log(`🌐 访问地址: ${v2Result.url}`);
            console.log(`🔧 进程ID: ${process.pid}`);
            console.log(`📋 使用 'uvx-proxy-local --list' 查看运行中的进程`);
            console.log(`🛑 使用 'uvx-proxy-local --kill ${process.pid}' 终止此进程`);

            processManager.daemonizeCurrentProcess();

            // 设置信号处理
            process.on('SIGTERM', async () => {
              console.log('🛑 接收到终止信号，正在清理...');
              try {
                await v2Result.cleanup?.();
                processManager.removeProcess(process.pid);
                console.log('✅ V2代理已清理完成');
              } catch (error) {
                console.warn('⚠️  清理时出现警告:', error.message);
              }
              process.exit(0);
            });

            process.on('SIGINT', async () => {
              console.log('🛑 接收到中断信号，正在清理...');
              try {
                await v2Result.cleanup?.();
                processManager.removeProcess(process.pid);
                console.log('✅ V2代理已清理完成');
              } catch (error) {
                console.warn('⚠️  清理时出现警告:', error.message);
              }
              process.exit(0);
            });
          }
        } else {
          // 前台模式
          console.log('🎉 V2一键代理启动成功!');
          console.log(`🌐 访问地址: ${v2Result.url}`);
          if (v2Result.tunnel?.tunnelId) {
            console.log(`🆔 隧道ID: ${v2Result.tunnel.tunnelId}`);
          }
          if (v2Result.dns?.method) {
            console.log(`🌐 DNS方式: ${v2Result.dns.method}`);
          }
          console.log(`⏱️  总耗时: ${Math.round(v2Result.duration / 1000)}秒`);
          console.log('按 Ctrl+C 退出');

          // 设置信号处理
          process.on('SIGINT', async () => {
            console.log('\n🛑 正在关闭V2代理...');
            try {
              await v2Result.cleanup?.();
              console.log('✅ V2代理已关闭');
            } catch (error) {
              console.warn('⚠️  关闭时出现警告:', error.message);
            }
            process.exit(0);
          });
        }

        return; // V2流程完成，直接返回
      } catch (error) {
        console.error(`❌ V2代理创建失败: ${error.message}`);
        if (config.ui.verbose) {
          console.error('详细错误信息:', error);
        }
        process.exit(1);
      }
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
      // 处理后台模式
      if (options.daemon) {
        console.log(formatter.formatInfo('🚀 启动后台模式...'));
        
        // 创建隧道
        const result = await manager.createTunnelWithFallback(portNumber, selectedProvider, {
          timeout: config.timeout,
          retries: config.retries,
          resetDomain: options.resetDomain
        });
        
        const provider = manager.getCurrentProvider();
        
        // 将进程信息保存到进程管理器
        const processInfo = processManager.addProcess({
          pid: process.pid,
          port: portNumber,
          url: result.url,
          provider: provider.name,
          originalUrl: result.originalUrl || result.url,
          features: provider.getFeatures()
        });
        
        if (processInfo) {
          console.log(formatter.formatTunnelSuccess(result, provider, provider.getFeatures()));
          
          // 显示隧道使用指南（仅对 Cloudflare 提供商）
          if (provider.name === 'cloudflare' && provider.showTunnelGuidance) {
            provider.showTunnelGuidance(result.url);
          }
          
          console.log(formatter.formatInfo(`✅ 进程已转为后台运行 (PID: ${process.pid})`));
          console.log(formatter.formatInfo(`📋 使用 'uvx-proxy-local --list' 查看运行中的进程`));
          console.log(formatter.formatInfo(`🛑 使用 'uvx-proxy-local --kill ${process.pid}' 终止此进程`));
          
          // 配置后台运行
          processManager.daemonizeCurrentProcess();
          
          // 保持进程运行，监听终止信号
          process.on('SIGTERM', async () => {
            console.log(formatter.formatTunnelClosing());
            try {
              await provider.closeTunnel();
              processManager.removeProcess(process.pid);
              console.log(formatter.formatTunnelClosed());
            } catch (error) {
              console.log(formatter.formatWarning(`隧道关闭时出现警告: ${error.message}`));
            }
            process.exit(0);
          });
          
          process.on('SIGINT', async () => {
            console.log(formatter.formatTunnelClosing());
            try {
              await provider.closeTunnel();
              processManager.removeProcess(process.pid);
              console.log(formatter.formatTunnelClosed());
            } catch (error) {
              console.log(formatter.formatWarning(`隧道关闭时出现警告: ${error.message}`));
            }
            process.exit(0);
          });
        } else {
          console.log(formatter.formatWarning('警告: 无法保存进程信息，但隧道已创建'));
          console.log(formatter.formatTunnelSuccess(result, provider, provider.getFeatures()));
        }
        
        // 在后台模式下保持进程运行
        return;
      } else {
        // 正常前台模式
        const result = await manager.createTunnelWithFallback(portNumber, selectedProvider, {
          timeout: config.timeout,
          retries: config.retries,
          resetDomain: options.resetDomain
        });
        
        // 显示成功信息 - 使用新的格式化器
        const provider = manager.getCurrentProvider();
        const features = provider.getFeatures();
        
        console.log(formatter.formatTunnelSuccess(result, provider, features));
        
        // 显示隧道使用指南（仅对 Cloudflare 提供商）
        if (provider.name === 'cloudflare' && provider.showTunnelGuidance) {
          provider.showTunnelGuidance(result.url);
        }
        
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
      }
      
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