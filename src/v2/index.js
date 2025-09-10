/**
 * V2 Cloudflare 一键代理入口模块
 * 提供完整的端到端集成功能
 */

// 导出所有V2核心模块
export { ConfigManager } from './config-manager.js';
export { ValidationEngine } from './validation-engine.js';
export { TunnelLifecycle } from './tunnel-lifecycle.js';
export { DNSManager } from './dns-manager.js';
export { ErrorHandler } from './error-handler.js';
export { UserGuidance } from './user-guidance.js';
export { CloudflareV2Provider } from './cloudflare-v2-provider.js';

// 导出主要的一键代理函数
import { UserGuidance } from './user-guidance.js';

/**
 * V2一键代理主函数
 * @param {number} port - 本地端口
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 代理结果
 */
export async function createV2Proxy(port, options = {}) {
  const userGuidance = new UserGuidance();
  
  try {
    const result = await userGuidance.createOneClickProxy(port, {
      interactive: options.interactive !== false,
      subdomain: options.subdomain,
      customDomain: options.customDomain,
      authMode: options.authMode || 'auto',
      nonInteractive: options.daemon || false,
      ...options
    });
    
    // 添加cleanup功能到结果中
    result.cleanup = async () => {
      return await userGuidance.cleanup();
    };
    
    // 保存userGuidance引用以备后续使用
    result.userGuidance = userGuidance;
    
    return result;
  } catch (error) {
    // 确保清理资源
    try {
      await userGuidance.cleanup();
    } catch (cleanupError) {
      console.warn('清理资源时出现警告:', cleanupError.message);
    }
    
    throw error;
  }
}

/**
 * 获取V2功能状态
 * @returns {Promise<Object>} 状态信息
 */
export async function getV2Status() {
  const userGuidance = new UserGuidance();
  
  try {
    return await userGuidance.getSessionStatus();
  } catch (error) {
    return {
      error: error.message,
      available: false
    };
  }
}