import inquirer from 'inquirer';
import chalk from 'chalk';
import { processManager } from './process-manager.js';

/**
 * 交互式进程管理工具
 * 提供用户友好的进程终止界面
 */
export class InteractiveProcessManager {
  /**
   * 显示交互式进程终止菜单
   */
  async showKillMenu() {
    try {
      const runningProcesses = processManager.getRunningProcesses();
      
      if (runningProcesses.length === 0) {
        console.log(chalk.yellow('⚠️ 没有运行中的代理进程'));
        return { cancelled: true };
      }
      
      console.log(chalk.blue('🔍 运行中的代理进程:'));
      console.log('');
      
      // 创建进程选择列表
      const processChoices = runningProcesses.map(proc => {
        const startTime = new Date(proc.startTime).toLocaleString();
        const runningTime = Math.round((Date.now() - new Date(proc.startTime)) / 1000);
        const displayTime = runningTime > 60 ? `${Math.round(runningTime/60)}分钟` : `${runningTime}秒`;
        
        return {
          name: `PID ${proc.pid} - ${proc.provider} (端口 ${proc.port}) - 运行 ${displayTime}`,
          value: proc,
          short: `PID ${proc.pid}`
        };
      });
      
      // 添加额外的选择项
      processChoices.push(
        new inquirer.Separator(),
        {
          name: '🚫 取消操作',
          value: 'cancel',
          short: '取消'
        },
        {
          name: '🔥 终止所有进程',
          value: 'kill-all',
          short: '全部终止'
        }
      );
      
      const { selectedAction } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedAction',
          message: '请选择要执行的操作:',
          choices: processChoices,
          pageSize: 10
        }
      ]);
      
      if (selectedAction === 'cancel') {
        console.log(chalk.gray('操作已取消'));
        return { cancelled: true };
      }
      
      if (selectedAction === 'kill-all') {
        return this.handleKillAll(runningProcesses);
      }
      
      // 单个进程终止
      return this.handleSingleKill(selectedAction);
      
    } catch (error) {
      console.error(chalk.red(`交互式菜单错误: ${error.message}`));
      return { error: error.message };
    }
  }
  
  /**
   * 显示多选进程终止菜单
   */
  async showMultiKillMenu() {
    try {
      const runningProcesses = processManager.getRunningProcesses();
      
      if (runningProcesses.length === 0) {
        console.log(chalk.yellow('⚠️ 没有运行中的代理进程'));
        return { cancelled: true };
      }
      
      console.log(chalk.blue('🔍 选择要终止的进程 (使用空格键选择/取消选择):'));
      console.log('');
      
      // 创建进程多选列表
      const processChoices = runningProcesses.map(proc => {
        const startTime = new Date(proc.startTime).toLocaleString();
        const runningTime = Math.round((Date.now() - new Date(proc.startTime)) / 1000);
        const displayTime = runningTime > 60 ? `${Math.round(runningTime/60)}分钟` : `${runningTime}秒`;
        
        return {
          name: `PID ${proc.pid} - ${proc.provider} (端口 ${proc.port}) - ${proc.url.substring(0, 40)}${proc.url.length > 40 ? '...' : ''}`,
          value: proc,
          short: `PID ${proc.pid}`
        };
      });
      
      const { selectedProcesses } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedProcesses',
          message: '选择要终止的进程:',
          choices: processChoices,
          validate: (input) => {
            if (input.length === 0) {
              return '请至少选择一个进程';
            }
            return true;
          }
        }
      ]);
      
      if (selectedProcesses.length === 0) {
        console.log(chalk.gray('没有选择任何进程，操作已取消'));
        return { cancelled: true };
      }
      
      return this.handleMultiKill(selectedProcesses);
      
    } catch (error) {
      console.error(chalk.red(`多选菜单错误: ${error.message}`));
      return { error: error.message };
    }
  }
  
  /**
   * 处理单个进程终止
   */
  async handleSingleKill(process) {
    try {
      console.log(chalk.yellow(`\n⚠️ 即将终止进程:`));
      console.log(chalk.gray(`  PID: ${process.pid}`));
      console.log(chalk.gray(`  提供商: ${process.provider}`));
      console.log(chalk.gray(`  端口: ${process.port}`));
      console.log(chalk.gray(`  URL: ${process.url}`));
      
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: '确定要终止此进程吗?',
          default: false
        }
      ]);
      
      if (!confirmed) {
        console.log(chalk.gray('操作已取消'));
        return { cancelled: true };
      }
      
      console.log(chalk.blue(`🔄 正在终止进程 ${process.pid}...`));
      const result = await processManager.killProcess(process.pid);
      
      if (result.success) {
        console.log(chalk.green(`✅ 进程 ${process.pid} 已成功终止`));
        return { 
          success: true, 
          killedProcesses: 1,
          message: '进程已成功终止'
        };
      } else {
        console.log(chalk.red(`❌ 终止进程 ${process.pid} 失败: ${result.message}`));
        return { 
          success: false, 
          error: result.message 
        };
      }
      
    } catch (error) {
      console.error(chalk.red(`终止进程失败: ${error.message}`));
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 处理多个进程终止
   */
  async handleMultiKill(processes) {
    try {
      console.log(chalk.yellow(`\n⚠️ 即将终止 ${processes.length} 个进程:`));
      processes.forEach(proc => {
        console.log(chalk.gray(`  • PID ${proc.pid} - ${proc.provider} (端口 ${proc.port})`));
      });
      
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: `确定要终止这 ${processes.length} 个进程吗?`,
          default: false
        }
      ]);
      
      if (!confirmed) {
        console.log(chalk.gray('操作已取消'));
        return { cancelled: true };
      }
      
      console.log(chalk.blue(`🔄 正在终止 ${processes.length} 个进程...`));
      
      let success = 0;
      let failed = 0;
      const results = [];
      
      for (const proc of processes) {
        console.log(chalk.gray(`  正在终止 PID ${proc.pid}...`));
        const result = await processManager.killProcess(proc.pid);
        
        if (result.success) {
          success++;
          console.log(chalk.green(`    ✅ PID ${proc.pid} 已终止`));
        } else {
          failed++;
          console.log(chalk.red(`    ❌ PID ${proc.pid} 终止失败: ${result.message}`));
        }
        
        results.push({ pid: proc.pid, ...result });
      }
      
      console.log('');
      if (success > 0) {
        console.log(chalk.green(`✅ 成功终止 ${success} 个进程`));
      }
      if (failed > 0) {
        console.log(chalk.red(`❌ ${failed} 个进程终止失败`));
      }
      
      return {
        success: success > 0,
        killedProcesses: success,
        failedProcesses: failed,
        results
      };
      
    } catch (error) {
      console.error(chalk.red(`批量终止进程失败: ${error.message}`));
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 处理终止所有进程
   */
  async handleKillAll(processes) {
    try {
      console.log(chalk.red(`\n⚠️ 即将终止所有 ${processes.length} 个代理进程!`));
      console.log(chalk.yellow('这将停止所有正在运行的隧道连接。'));
      
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: `确定要终止所有 ${processes.length} 个进程吗? 此操作不可撤销!`,
          default: false
        }
      ]);
      
      if (!confirmed) {
        console.log(chalk.gray('操作已取消'));
        return { cancelled: true };
      }
      
      const { doubleConfirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'doubleConfirmed',
          message: '请再次确认: 真的要终止所有进程吗?',
          default: false
        }
      ]);
      
      if (!doubleConfirmed) {
        console.log(chalk.gray('操作已取消'));
        return { cancelled: true };
      }
      
      return this.handleMultiKill(processes);
      
    } catch (error) {
      console.error(chalk.red(`终止所有进程失败: ${error.message}`));
      return { success: false, error: error.message };
    }
  }
}

// 创建单例实例
export const interactiveProcessManager = new InteractiveProcessManager();