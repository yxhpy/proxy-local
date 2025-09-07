import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';

/**
 * 后台进程管理器
 * 处理代理进程的后台化、进程信息存储和管理
 */
export class ProcessManager {
  constructor() {
    this.processesDir = join(homedir(), '.uvx');
    this.processesFile = join(this.processesDir, 'processes.json');
    this.initProcessesStorage();
  }

  /**
   * 初始化进程存储目录和文件
   */
  initProcessesStorage() {
    if (!existsSync(this.processesDir)) {
      mkdirSync(this.processesDir, { recursive: true });
    }
    
    if (!existsSync(this.processesFile)) {
      this.saveProcesses([]);
    }
  }

  /**
   * 读取进程信息列表
   */
  readProcesses() {
    try {
      const data = readFileSync(this.processesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn(chalk.yellow(`读取进程文件失败: ${error.message}`));
      return [];
    }
  }

  /**
   * 保存进程信息列表
   */
  saveProcesses(processes) {
    try {
      writeFileSync(this.processesFile, JSON.stringify(processes, null, 2));
      return true;
    } catch (error) {
      console.error(chalk.red(`保存进程文件失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 检查进程是否仍在运行
   */
  isProcessAlive(pid) {
    try {
      // 发送信号 0 来检查进程是否存在，不会实际杀死进程
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // ESRCH 错误表示进程不存在
      return error.code !== 'ESRCH';
    }
  }

  /**
   * 添加进程信息到存储
   */
  addProcess(processInfo) {
    const processes = this.readProcesses();
    const newProcess = {
      id: Date.now().toString(),
      pid: processInfo.pid,
      port: processInfo.port,
      url: processInfo.url,
      provider: processInfo.provider,
      startTime: new Date().toISOString(),
      status: 'running',
      ...processInfo
    };
    
    processes.push(newProcess);
    const saved = this.saveProcesses(processes);
    
    if (saved) {
      console.log(chalk.green(`✅ 进程信息已保存: PID ${newProcess.pid}`));
      return newProcess;
    }
    
    return null;
  }

  /**
   * 从存储中移除进程信息
   */
  removeProcess(pid) {
    const processes = this.readProcesses();
    const filteredProcesses = processes.filter(p => p.pid !== pid);
    const saved = this.saveProcesses(filteredProcesses);
    
    if (saved) {
      console.log(chalk.gray(`🗑️ 已移除进程信息: PID ${pid}`));
      return true;
    }
    
    return false;
  }

  /**
   * 获取所有运行中的进程（过滤掉已结束的）
   */
  getRunningProcesses() {
    const processes = this.readProcesses();
    const runningProcesses = [];
    const toRemove = [];
    
    for (const process of processes) {
      if (this.isProcessAlive(process.pid)) {
        runningProcesses.push(process);
      } else {
        // 标记为需要从存储中移除的无效进程
        toRemove.push(process.pid);
      }
    }
    
    // 清理无效进程
    if (toRemove.length > 0) {
      const validProcesses = processes.filter(p => !toRemove.includes(p.pid));
      this.saveProcesses(validProcesses);
      console.log(chalk.gray(`🧹 清理了 ${toRemove.length} 个无效进程记录`));
    }
    
    return runningProcesses;
  }

  /**
   * 终止指定进程
   */
  async killProcess(pid, signal = 'SIGTERM') {
    try {
      if (!this.isProcessAlive(pid)) {
        console.log(chalk.yellow(`⚠️ 进程 ${pid} 已不存在`));
        this.removeProcess(pid);
        return { success: true, message: '进程已不存在，已清理记录' };
      }

      console.log(chalk.gray(`🔄 正在终止进程 ${pid}...`));
      
      // 发送终止信号
      process.kill(pid, signal);
      
      // 等待进程结束
      let attempts = 0;
      const maxAttempts = 10;
      
      while (this.isProcessAlive(pid) && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      
      if (this.isProcessAlive(pid)) {
        // 如果进程仍在运行，强制终止
        console.log(chalk.yellow(`⚠️ 进程 ${pid} 未响应 ${signal}，强制终止...`));
        process.kill(pid, 'SIGKILL');
        
        // 再等待一会儿
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (!this.isProcessAlive(pid)) {
        this.removeProcess(pid);
        console.log(chalk.green(`✅ 进程 ${pid} 已成功终止`));
        return { success: true, message: '进程已成功终止' };
      } else {
        console.log(chalk.red(`❌ 无法终止进程 ${pid}`));
        return { success: false, message: '无法终止进程' };
      }
    } catch (error) {
      console.error(chalk.red(`终止进程失败: ${error.message}`));
      return { success: false, message: `终止失败: ${error.message}` };
    }
  }

  /**
   * 启动后台进程
   * @param {string} command 命令
   * @param {Array} args 参数
   * @param {Object} options 选项
   * @returns {Object} 进程信息
   */
  startBackgroundProcess(command, args, options = {}) {
    try {
      const {
        cwd = process.cwd(),
        env = process.env,
        detached = true
      } = options;

      console.log(chalk.blue(`🚀 启动后台进程: ${command} ${args.join(' ')}`));
      
      // 创建分离的子进程
      const childProcess = spawn(command, args, {
        detached,
        stdio: ['ignore', 'pipe', 'pipe'], // 重定向输出
        cwd,
        env
      });

      if (detached) {
        // 分离进程，使其独立于父进程运行
        childProcess.unref();
      }

      console.log(chalk.green(`✅ 后台进程已启动，PID: ${childProcess.pid}`));
      
      return {
        pid: childProcess.pid,
        process: childProcess,
        success: true
      };
    } catch (error) {
      console.error(chalk.red(`启动后台进程失败: ${error.message}`));
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 将现有进程转为后台模式
   * 注意：这个功能在 Node.js 中有限制，通常需要在进程启动时设置
   */
  daemonizeCurrentProcess() {
    try {
      // 在 Unix-like 系统中，可以尝试分离进程
      if (process.platform !== 'win32') {
        console.log(chalk.blue('🔄 尝试将当前进程转为后台模式...'));
        
        // 忽略 SIGHUP 信号（当终端关闭时发送）
        process.on('SIGHUP', () => {
          console.log('收到 SIGHUP 信号，继续在后台运行');
        });
        
        // 重定向标准输入输出到 /dev/null
        if (process.stdin && typeof process.stdin.pause === 'function') {
          process.stdin.pause();
        }
        
        console.log(chalk.green('✅ 进程已配置为后台模式'));
        return true;
      } else {
        console.log(chalk.yellow('⚠️ Windows 系统不支持直接进程分离'));
        return false;
      }
    } catch (error) {
      console.error(chalk.red(`进程后台化失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 获取进程统计信息
   */
  getProcessStats() {
    const processes = this.getRunningProcesses();
    const stats = {
      total: processes.length,
      byProvider: {},
      oldestStart: null,
      newestStart: null
    };
    
    processes.forEach(proc => {
      // 按提供商统计
      stats.byProvider[proc.provider] = (stats.byProvider[proc.provider] || 0) + 1;
      
      // 找出最早和最晚的启动时间
      const startTime = new Date(proc.startTime);
      if (!stats.oldestStart || startTime < stats.oldestStart) {
        stats.oldestStart = startTime;
      }
      if (!stats.newestStart || startTime > stats.newestStart) {
        stats.newestStart = startTime;
      }
    });
    
    return stats;
  }
}

// 创建单例实例
export const processManager = new ProcessManager();