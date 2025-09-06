import { spawn } from 'child_process';
import { platform } from 'os';
import chalk from 'chalk';

/**
 * Cloudflared 安装工具
 */
export class CloudflaredInstaller {
  /**
   * 检查 cloudflared 是否已安装
   */
  static async isInstalled() {
    return new Promise((resolve) => {
      const child = spawn('cloudflared', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let hasOutput = false;

      child.stdout.on('data', () => {
        hasOutput = true;
      });

      child.stderr.on('data', () => {
        hasOutput = true;
      });

      child.on('close', (code) => {
        resolve(hasOutput && code !== null);
      });

      child.on('error', () => {
        resolve(false);
      });

      // 超时处理
      setTimeout(() => {
        if (!child.killed) {
          child.kill();
          resolve(false);
        }
      }, 3000);
    });
  }

  /**
   * 获取安装命令
   */
  static getInstallCommand() {
    const currentPlatform = platform();
    
    switch (currentPlatform) {
      case 'darwin': // macOS
        return {
          command: 'brew',
          args: ['install', 'cloudflared'],
          description: 'brew install cloudflared'
        };
      case 'linux':
        return {
          command: 'wget',
          args: ['-O', '/tmp/cloudflared.deb', 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb'],
          postInstall: {
            command: 'sudo',
            args: ['dpkg', '-i', '/tmp/cloudflared.deb'],
            description: 'sudo dpkg -i /tmp/cloudflared.deb'
          },
          description: 'wget + dpkg 安装'
        };
      case 'win32': // Windows
        return {
          command: 'winget',
          args: ['install', '--id', 'Cloudflare.cloudflared'],
          description: 'winget install --id Cloudflare.cloudflared'
        };
      default:
        throw new Error(`不支持的操作系统: ${currentPlatform}`);
    }
  }

  /**
   * 自动安装 cloudflared
   */
  static async autoInstall() {
    console.log(chalk.yellow('🔧 检测到 cloudflared 未安装，正在自动安装...'));
    
    try {
      const installConfig = this.getInstallCommand();
      console.log(chalk.blue(`📦 使用命令: ${installConfig.description}`));
      
      // 执行主安装命令
      await this._executeCommand(installConfig.command, installConfig.args);
      
      // 如果有后续安装命令（如 Linux 的 dpkg）
      if (installConfig.postInstall) {
        console.log(chalk.blue(`📦 执行后续安装: ${installConfig.postInstall.description}`));
        await this._executeCommand(installConfig.postInstall.command, installConfig.postInstall.args);
      }
      
      // 验证安装
      console.log(chalk.blue('🔍 验证安装结果...'));
      const installed = await this.isInstalled();
      
      if (installed) {
        console.log(chalk.green('✅ cloudflared 安装成功！'));
        return true;
      } else {
        throw new Error('安装完成但验证失败');
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ 自动安装失败: ${error.message}`));
      console.log(chalk.yellow('💡 请手动安装 cloudflared:'));
      console.log(chalk.cyan('  macOS: brew install cloudflared'));
      console.log(chalk.cyan('  Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'));
      console.log(chalk.cyan('  Windows: winget install --id Cloudflare.cloudflared'));
      return false;
    }
  }

  /**
   * 执行系统命令
   */
  static _executeCommand(command, args) {
    return new Promise((resolve, reject) => {
      console.log(chalk.gray(`执行: ${command} ${args.join(' ')}`));
      
      const child = spawn(command, args, {
        stdio: 'inherit'
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`命令执行失败，退出代码: ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`启动命令失败: ${err.message}`));
      });
    });
  }

  /**
   * 提示用户手动安装
   */
  static showManualInstallInstructions() {
    console.log(chalk.yellow('⚠️  cloudflared 未安装'));
    console.log(chalk.blue('请根据你的操作系统安装 cloudflared:'));
    console.log('');
    console.log(chalk.cyan('macOS:'));
    console.log(chalk.white('  brew install cloudflared'));
    console.log('');
    console.log(chalk.cyan('Linux (Debian/Ubuntu):'));
    console.log(chalk.white('  wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb'));
    console.log(chalk.white('  sudo dpkg -i cloudflared-linux-amd64.deb'));
    console.log('');
    console.log(chalk.cyan('Linux (其他):'));
    console.log(chalk.white('  wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64'));
    console.log(chalk.white('  sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared'));
    console.log(chalk.white('  sudo chmod +x /usr/local/bin/cloudflared'));
    console.log('');
    console.log(chalk.cyan('Windows:'));
    console.log(chalk.white('  winget install --id Cloudflare.cloudflared'));
    console.log('');
    console.log(chalk.blue('安装完成后，请重新运行此命令。'));
  }
}