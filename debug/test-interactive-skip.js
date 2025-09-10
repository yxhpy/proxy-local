#!/usr/bin/env node

/**
 * 测试交互式跳过认证的调试脚本
 */

import { UserGuidance } from '../src/v2/user-guidance.js';

async function testInteractiveSkip() {
  console.log('🧪 测试交互式跳过认证逻辑...');
  
  const userGuidance = new UserGuidance();
  
  console.log('📋 初始状态:');
  console.log('  operationContext:', userGuidance.operationContext);
  
  // 模拟用户选择跳过认证
  console.log('\\n🎭 模拟用户选择跳过认证...');
  userGuidance.operationContext.userSkippedAuth = true;
  
  console.log('📋 设置后状态:');
  console.log('  operationContext.userSkippedAuth:', userGuidance.operationContext.userSkippedAuth);
  
  // 测试隧道创建逻辑
  console.log('\\n🚇 测试隧道创建逻辑...');
  
  try {
    // 模拟认证状态检查
    const hasAuth = await userGuidance.configManager.checkCertPem();
    console.log('  hasAuth:', hasAuth);
    
    // 模拟选项
    const options = {};
    console.log('  options.skipAuth:', options.skipAuth);
    
    // 测试强制快速隧道逻辑
    const forceQuickTunnel = options.skipAuth === true || userGuidance.operationContext.userSkippedAuth === true;
    console.log('  forceQuickTunnel:', forceQuickTunnel);
    
    // 判断应该使用的隧道类型
    const shouldUseQuickTunnel = !hasAuth || forceQuickTunnel;
    console.log('  shouldUseQuickTunnel:', shouldUseQuickTunnel);
    
    if (shouldUseQuickTunnel) {
      console.log('✅ 应该使用快速隧道');
    } else {
      console.log('❌ 应该使用命名隧道 - 这不符合预期！');
    }
    
  } catch (error) {
    console.error('❌ 测试过程出错:', error.message);
  }
}

testInteractiveSkip();