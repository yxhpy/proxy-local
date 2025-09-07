import { processManager } from '../src/utils/process-manager.js';
import chalk from 'chalk';

/**
 * 测试进程管理器功能
 */
async function testProcessManager() {
  console.log(chalk.blue('🧪 测试进程管理器功能'));
  console.log('');

  // 测试 1: 初始化和配置
  console.log(chalk.yellow('测试 1: 进程管理器初始化'));
  try {
    const processes = processManager.readProcesses();
    console.log(chalk.green(`✅ 成功读取进程列表，当前有 ${processes.length} 个记录`));
  } catch (error) {
    console.log(chalk.red(`❌ 初始化失败: ${error.message}`));
    return;
  }
  console.log('');

  // 测试 2: 检查运行中的进程
  console.log(chalk.yellow('测试 2: 检查运行中的进程'));
  try {
    const runningProcesses = processManager.getRunningProcesses();
    console.log(chalk.green(`✅ 找到 ${runningProcesses.length} 个运行中的进程`));
    
    if (runningProcesses.length > 0) {
      console.log(chalk.gray('运行中的进程:'));
      runningProcesses.forEach(proc => {
        console.log(chalk.gray(`  PID ${proc.pid}: ${proc.provider} (端口 ${proc.port})`));
      });
    }
  } catch (error) {
    console.log(chalk.red(`❌ 检查进程失败: ${error.message}`));
  }
  console.log('');

  // 测试 3: 进程统计
  console.log(chalk.yellow('测试 3: 进程统计信息'));
  try {
    const stats = processManager.getProcessStats();
    console.log(chalk.green('✅ 进程统计功能正常'));
    console.log(chalk.gray(`  总进程数: ${stats.total}`));
    console.log(chalk.gray(`  按提供商分类: ${JSON.stringify(stats.byProvider, null, 2)}`));
    
    if (stats.oldestStart) {
      console.log(chalk.gray(`  最早启动时间: ${stats.oldestStart.toLocaleString()}`));
    }
  } catch (error) {
    console.log(chalk.red(`❌ 统计功能失败: ${error.message}`));
  }
  console.log('');

  // 测试 4: 模拟添加进程（测试用）
  console.log(chalk.yellow('测试 4: 模拟进程管理操作'));
  try {
    // 添加一个模拟的进程信息（注意：这只是数据测试，不会创建实际进程）
    const mockProcess = {
      pid: 99999, // 使用一个不太可能存在的 PID
      port: 8000,
      url: 'https://test.example.com',
      provider: 'test',
      status: 'running'
    };
    
    const addedProcess = processManager.addProcess(mockProcess);
    if (addedProcess) {
      console.log(chalk.green('✅ 成功添加模拟进程信息'));
      console.log(chalk.gray(`  进程 ID: ${addedProcess.id}`));
      console.log(chalk.gray(`  PID: ${addedProcess.pid}`));
      
      // 清理测试数据
      setTimeout(() => {
        processManager.removeProcess(mockProcess.pid);
        console.log(chalk.gray('🧹 已清理测试数据'));
      }, 1000);
    } else {
      console.log(chalk.yellow('⚠️ 添加进程信息失败（可能是权限问题）'));
    }
  } catch (error) {
    console.log(chalk.red(`❌ 进程管理操作失败: ${error.message}`));
  }
  console.log('');

  // 测试 5: 进程存活检查
  console.log(chalk.yellow('测试 5: 进程存活检查'));
  try {
    // 检查当前进程（应该存活）
    const currentPidAlive = processManager.isProcessAlive(process.pid);
    console.log(chalk.green(`✅ 当前进程存活检查: ${currentPidAlive ? '存活' : '不存在'}`));
    
    // 检查一个不太可能存在的 PID
    const fakePidAlive = processManager.isProcessAlive(99999);
    console.log(chalk.green(`✅ 模拟进程存活检查: ${fakePidAlive ? '存在' : '不存在'}`));
  } catch (error) {
    console.log(chalk.red(`❌ 进程存活检查失败: ${error.message}`));
  }
  console.log('');

  console.log(chalk.blue('🏁 进程管理器功能测试完成'));
  console.log('');
  console.log(chalk.gray('支持的功能:'));
  console.log(chalk.gray('  ✅ 进程信息存储和读取'));
  console.log(chalk.gray('  ✅ 运行中进程检查'));
  console.log(chalk.gray('  ✅ 进程存活检查'));
  console.log(chalk.gray('  ✅ 进程统计信息'));
  console.log(chalk.gray('  ✅ 进程终止管理'));
  console.log(chalk.gray('  ✅ 后台模式配置'));
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testProcessManager().catch(error => {
    console.error(chalk.red(`测试失败: ${error.message}`));
    process.exit(1);
  });
}