// 简化的配置模块导出
export { ConfigLoader, configLoader } from './config-loader.js';

/**
 * 快捷配置加载函数
 * @param {Object} cliOptions - CLI 选项
 * @returns {Object} 合并后的配置对象
 */
export async function loadConfig(cliOptions = {}) {
  const { configLoader } = await import('./config-loader.js');
  return configLoader.loadConfig(cliOptions);
}

/**
 * 获取优先级说明
 */
export const CONFIG_PRIORITY = {
  CLI: 1,           // 最高优先级：CLI 参数
  ENV: 2,           // 环境变量
  USER_FILE: 3,     // 用户配置文件 (~/.uvx/config.json)
  PROJECT_FILE: 4,  // 项目配置文件 (.uvxrc)
  DEFAULTS: 5       // 最低优先级：程序默认值
};

/**
 * 支持的环境变量列表
 */
export const SUPPORTED_ENV_VARS = {
  // 基本配置
  UVX_PROVIDER: '默认提供商 (cloudflare, pinggy, serveo, localtunnel)',
  UVX_TIMEOUT: '超时时间（毫秒）',
  UVX_RETRIES: '重试次数',
  
  // Cloudflare 配置
  UVX_CLOUDFLARE_TOKEN: 'Cloudflare 认证令牌',
  UVX_CLOUDFLARE_CUSTOM_DOMAIN: 'Cloudflare 自定义域名',
  UVX_CLOUDFLARE_TEMP_MODE: 'Cloudflare 临时模式 (true/false)',
  
  // UI 配置
  UVX_VERBOSE: '详细输出 (true/false)',
  UVX_NO_COLORS: '禁用颜色 (true/false)',
  UVX_NO_ICONS: '禁用图标 (true/false)'
};

/**
 * 支持的配置文件格式
 */
export const SUPPORTED_CONFIG_FILES = [
  '.uvxrc',
  '.uvxrc.json',
  '.uvxrc.yaml',
  '.uvxrc.yml',
  '.uvxrc.js',
  '.uvx.config.js',
  '.uvx.config.json',
  'uvx.config.js',
  'package.json (uvx 字段)'
];