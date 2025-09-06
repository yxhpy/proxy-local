#!/usr/bin/env node

import { runProviderManagerTests } from './provider-manager.test.js';
import { runInterfaceValidationTests } from './interface-validation.test.js';
import { runCliParsingTests } from './cli-parser.test.js';
import { runCloudflareProviderTests } from './cloudflare-provider.test.js';
import { runFallbackMechanismTests } from './fallback-mechanism.test.js';
import { runOutputFormatterTests } from './output-formatter.test.js';
import { runConfigLoaderTests } from './config-loader.test.js';

/**
 * Test Runner for Tunnel Provider Architecture
 */
async function runAllTests() {
  console.log('🚀 Starting Architecture Tests for Tunnel Provider System\n');
  
  const startTime = Date.now();
  let totalTests = 0;
  let passedTests = 0;
  
  try {
    // Run ProviderManager tests
    console.log('=' .repeat(60));
    await runProviderManagerTests();
    passedTests++;
    totalTests++;
    
    console.log('\n' + '=' .repeat(60));
    await runInterfaceValidationTests();
    passedTests++;
    totalTests++;
    
    console.log('\n' + '=' .repeat(60));
    await runCliParsingTests();
    passedTests++;
    totalTests++;
    
    console.log('\n' + '=' .repeat(60));
    await runCloudflareProviderTests();
    passedTests++;
    totalTests++;
    
    console.log('\n' + '=' .repeat(60));
    await runFallbackMechanismTests();
    passedTests++;
    totalTests++;
    
    console.log('\n' + '=' .repeat(60));
    await runOutputFormatterTests();
    passedTests++;
    totalTests++;
    
    console.log('\n' + '=' .repeat(60));
    await runConfigLoaderTests();
    passedTests++;
    totalTests++;
    
    // Summary
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 TEST SUMMARY');
    console.log('=' .repeat(60));
    console.log(`✅ All ${passedTests}/${totalTests} test suites passed!`);
    console.log(`⏱️  Total execution time: ${duration.toFixed(2)}s`);
    console.log('\n🏗️  Architecture validation complete!');
    console.log('   The Tunnel Provider system is properly implemented with:');
    console.log('   • Abstract TunnelProvider interface');
    console.log('   • Provider registration and management');  
    console.log('   • Smart fallback mechanisms');
    console.log('   • Comprehensive error handling');
    console.log('   • Extensible provider system');
    
    process.exit(0);
    
  } catch (error) {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\n' + '=' .repeat(60));
    console.log('❌ TEST FAILURE');
    console.log('=' .repeat(60));
    console.log(`Failed: ${totalTests - passedTests}/${totalTests} test suites`);
    console.log(`⏱️  Execution time: ${duration.toFixed(2)}s`);
    console.log('\n💥 Error details:');
    console.error(error);
    
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}