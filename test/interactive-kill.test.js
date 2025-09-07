import { interactiveProcessManager } from '../src/utils/interactive-process-manager.js';
import { processManager } from '../src/utils/process-manager.js';
import chalk from 'chalk';

/**
 * 测试交互式进程终止功能
 * 注意：这个测试需要手动交互，适合在开发时使用
 */
async function testInteractiveKill() {
  console.log(chalk.blue('🧪 测试交互式进程终止功能'));
  console.log(chalk.yellow('注意：此测试需要用户交互，请按提示操作'));
  console.log('');

  // 首先添加一些模拟进程数据用于测试
  console.log(chalk.gray('添加模拟进程数据用于测试...'));
  
  const mockProcesses = [
    {
      pid: 11111,
      port: 3000,
      url: 'https://test1.trycloudflare.com',
      provider: 'cloudflare'
    },
    {
      pid: 22222,
      port: 8080,
      url: 'https://test2.localtunnel.me',
      provider: 'localtunnel'
    },
    {
      pid: 33333,
      port: 9000,
      url: 'https://test3.serveonet.com',
      provider: 'serveo'
    }
  ];
  
  // 添加模拟数据
  mockProcesses.forEach(proc => {
    processManager.addProcess(proc);
  });
  
  console.log(chalk.green('✅ 已添加 3 个模拟进程'));
  console.log('');
  
  try {
    // 显示当前进程列表
    console.log(chalk.blue('📋 当前进程列表:'));
    const processes = processManager.getRunningProcesses();
    console.table(processes.map(p => ({
      PID: p.pid,
      Port: p.port,
      Provider: p.provider,
      URL: p.url.substring(0, 40) + '...'
    })));
    console.log('');
    
    // 测试交互式菜单
    console.log(chalk.blue('🎯 启动交互式终止菜单...'));
    console.log(chalk.yellow('请使用上下箭头键选择，回车确认'));
    console.log('');
    
    const result = await interactiveProcessManager.showKillMenu();
    
    console.log('');
    console.log(chalk.blue('📊 操作结果:'));
    console.log(chalk.gray(JSON.stringify(result, null, 2)));
    
  } catch (error) {
    console.error(chalk.red(`测试失败: ${error.message}`));
  } finally {
    // 清理测试数据
    console.log(chalk.gray('🧹 清理测试数据...'));
    mockProcesses.forEach(proc => {
      processManager.removeProcess(proc.pid);
    });
    console.log(chalk.green('✅ 测试数据已清理'));
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testInteractiveKill().catch(error => {
    console.error(chalk.red(`测试失败: ${error.message}`));
    process.exit(1);
  });
}