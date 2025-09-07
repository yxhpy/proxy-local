import chalk from 'chalk';

/**
 * 控制台输出格式化工具
 * 提供统一的、美观的控制台输出格式
 */
export class OutputFormatter {
  constructor() {
    // 颜色主题
    this.colors = {
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red,
      info: chalk.blue,
      highlight: chalk.cyan,
      muted: chalk.gray,
      accent: chalk.magenta
    };

    // 图标集合
    this.icons = {
      success: '✅',
      warning: '⚠️ ',
      error: '❌',
      info: 'ℹ️ ',
      loading: '🔄',
      url: '🌐',
      features: '📋',
      speed: '⚡',
      security: '🔒',
      tip: '💡',
      auth: '🔐',
      logout: '🚪',
      tunnel: '🌉',
      rocket: '🚀',
      target: '🎯'
    };
  }

  /**
   * 格式化隧道创建成功的输出
   */
  formatTunnelSuccess(result, provider, features) {
    const lines = [];
    
    // 标题行
    lines.push('');
    lines.push(this.colors.success(`${this.icons.success} 隧道创建成功！`) + 
               this.colors.muted(` (提供商: ${result.provider})`));
    
    // URL 行 - 高亮显示
    lines.push(this.colors.highlight(`${this.icons.url} 公共 URL: `) + 
               this.colors.accent.underline(result.url));
    
    lines.push(''); // 空行
    
    // 特性信息标题
    lines.push(this.colors.info(`${this.icons.features} 特性信息:`));
    
    // 速度信息
    const speedColor = this.getSpeedColor(features.speed);
    lines.push(`   ${this.icons.speed} 速度: ${speedColor(features.speed)}`);
    
    // HTTPS 支持
    const httpsIcon = features.httpsSupport ? this.colors.success('✅') : this.colors.error('❌');
    const httpsText = features.httpsSupport ? 
      this.colors.success('支持') : this.colors.warning('不支持');
    lines.push(`   ${this.icons.security} HTTPS: ${httpsIcon} ${httpsText}`);
    
    // 确认页面提示
    if (features.requiresConfirmation) {
      lines.push(`   ${this.colors.warning(this.icons.warning)}${this.colors.warning('首次访问需要点击确认页面')}`);
      lines.push(`   📖 ${this.colors.muted('点击 "Continue" 或 "访问网站" 即可访问您的本地服务')}`);
    } else {
      lines.push(`   ${this.colors.success('✅ 无确认页面，直接访问！')}`);
    }
    
    // 其他特性信息
    if (features.benefits && Array.isArray(features.benefits)) {
      lines.push('');
      lines.push(this.colors.info('🎁 额外特性:'));
      features.benefits.forEach(benefit => {
        lines.push(`   ${this.colors.success('•')} ${this.colors.muted(benefit)}`);
      });
    }
    
    lines.push(''); // 空行
    
    // 描述信息
    lines.push(`${this.icons.tip} ${this.colors.info(features.description)}`);
    
    // 模式信息 (如果是 Cloudflare)
    if (result.provider === 'cloudflare') {
      let mode, modeColor;
      
      if (provider.namedTunnelConfig) {
        // 命名隧道模式（自定义域名）
        mode = '命名隧道模式';
        modeColor = this.colors.success;
      } else if (provider.authMode) {
        // 认证持久模式
        mode = '持久模式';
        modeColor = this.colors.success;
      } else {
        // 临时模式
        mode = '临时模式';
        modeColor = this.colors.info;
      }
      
      lines.push(`${this.icons.tunnel} 模式: ${modeColor(mode)}`);
      
      if (provider.customTunnelName) {
        lines.push(`${this.icons.target} 自定义名称: ${this.colors.accent(provider.customTunnelName)}`);
      }
      
      if (provider.namedTunnelConfig && provider.namedTunnelConfig.domain) {
        lines.push(`${this.icons.target} 自定义域名: ${this.colors.accent(provider.namedTunnelConfig.domain)}`);
      }
    }
    
    lines.push(''); // 空行
    
    // 控制提示
    lines.push(this.colors.muted('按 Ctrl+C 关闭隧道'));
    
    return lines.join('\n');
  }

  /**
   * 格式化提供商列表输出
   */
  formatProvidersList(providersInfo) {
    const lines = [];
    
    lines.push('');
    lines.push(this.colors.info(`${this.icons.features} 可用的隧道提供商:`));
    lines.push('');
    
    providersInfo.forEach(info => {
      const defaultIcon = info.isDefault ? 
        this.colors.accent('⭐ ') : '   ';
      const confirmIcon = info.features.requiresConfirmation ? 
        this.colors.warning(this.icons.warning) : this.colors.success('✅ ');
      
      // 提供商名称
      lines.push(`${defaultIcon}${this.colors.highlight.bold(info.name)}`);
      
      // 确认页面状态
      const confirmText = info.features.requiresConfirmation ? 
        this.colors.warning('需要点击确认') : this.colors.success('无需确认，直接访问');
      lines.push(`   ${confirmIcon}确认页面: ${confirmText}`);
      
      // 速度
      const speedColor = this.getSpeedColor(info.features.speed);
      lines.push(`   ${this.icons.speed} 速度: ${speedColor(info.features.speed)}`);
      
      // HTTPS
      const httpsText = info.features.httpsSupport ? 
        this.colors.success('支持') : this.colors.warning('不支持');
      lines.push(`   ${this.icons.security} HTTPS: ${httpsText}`);
      
      // 描述
      lines.push(`   ${this.icons.tip} ${this.colors.muted(info.features.description)}`);
      lines.push('');
    });
    
    return lines.join('\n');
  }

  /**
   * 格式化使用示例
   */
  formatUsageExamples(defaultProvider) {
    const lines = [];
    
    lines.push(this.colors.info('使用方法:'));
    lines.push(`   ${this.colors.muted('npx uvx-proxy-local 8000')}                           ${this.colors.muted('# 使用默认提供商')} (${this.colors.accent(defaultProvider || 'none')})`);
    lines.push(`   ${this.colors.muted('npx uvx-proxy-local 8000 --provider=pinggy')}         ${this.colors.muted('# 使用指定提供商')}`);
    lines.push(`   ${this.colors.muted('npx uvx-proxy-local 8000 --provider=cloudflare')}     ${this.colors.muted('# 使用 Cloudflare 隧道')}`);
    lines.push(`   ${this.colors.muted('npx uvx-proxy-local --cloudflare-login')}             ${this.colors.muted('# 登录 Cloudflare 账户')}`);
    lines.push(`   ${this.colors.muted('npx uvx-proxy-local --cloudflare-logout')}            ${this.colors.muted('# 登出 Cloudflare')}`);
    lines.push(`   ${this.colors.muted('npx uvx-proxy-local 8000 --cloudflare-custom=myapp')} ${this.colors.muted('# 使用自定义隧道名称')}`);
    lines.push('');
    
    return lines.join('\n');
  }

  /**
   * 格式化认证相关输出
   */
  formatAuthMessage(type, message, isSuccess = true) {
    const color = isSuccess ? this.colors.success : this.colors.error;
    const icon = type === 'login' ? this.icons.auth : 
                 type === 'logout' ? this.icons.logout : 
                 this.icons.info;
    
    return color(`${icon} ${message}`);
  }

  /**
   * 格式化错误消息
   */
  formatError(message, suggestions = []) {
    const lines = [];
    
    lines.push(`${this.colors.error(this.icons.error)} ${this.colors.error(message)}`);
    
    if (suggestions && suggestions.length > 0) {
      lines.push('');
      lines.push(this.colors.info(`${this.icons.tip} 故障排除建议:`));
      suggestions.forEach((suggestion, index) => {
        lines.push(`   ${this.colors.muted(`${index + 1}.`)} ${this.colors.muted(suggestion)}`);
      });
    }
    
    return lines.join('\n');
  }

  /**
   * 格式化警告消息
   */
  formatWarning(message) {
    return `${this.colors.warning(this.icons.warning)}${this.colors.warning(message)}`;
  }

  /**
   * 格式化信息消息
   */
  formatInfo(message) {
    return `${this.colors.info(this.icons.info)}${this.colors.info(message)}`;
  }

  /**
   * 格式化进度消息
   */
  formatProgress(message) {
    return `${this.colors.info(this.icons.loading)} ${this.colors.info(message)}`;
  }

  /**
   * 格式化隧道关闭消息
   */
  formatTunnelClosing() {
    return `\n\n${this.colors.info(this.icons.loading)} ${this.colors.info('正在关闭隧道...')}`;
  }

  /**
   * 格式化隧道关闭成功消息
   */
  formatTunnelClosed() {
    return `${this.colors.success(this.icons.success)} ${this.colors.success('隧道已安全关闭')}`;
  }

  /**
   * 根据速度获取对应的颜色
   */
  getSpeedColor(speed) {
    switch (speed) {
      case 'fast':
        return this.colors.success;
      case 'medium':
        return this.colors.warning;
      case 'slow':
        return this.colors.error;
      default:
        return this.colors.muted;
    }
  }

  /**
   * 创建分隔线
   */
  createSeparator(char = '=', length = 60) {
    return this.colors.muted(char.repeat(length));
  }

  /**
   * 格式化标题
   */
  formatTitle(title) {
    const separator = this.createSeparator();
    return `${separator}\n${this.colors.highlight.bold(title)}\n${separator}`;
  }

  /**
   * 格式化成功消息
   */
  formatSuccess(message) {
    return this.colors.success(`${this.icons.success} ${message}`);
  }
}

// 导出单例实例
export const formatter = new OutputFormatter();