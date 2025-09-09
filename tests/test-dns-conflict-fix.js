#!/usr/bin/env node

/**
 * Test script to verify DNS conflict resolution fix
 */

import { CloudflareProvider } from './src/providers/cloudflare.js';
import chalk from 'chalk';

console.log(chalk.blue('🧪 Testing DNS conflict resolution fix...'));

async function testDnsConflictFix() {
  try {
    const provider = new CloudflareProvider();
    
    // Test the fixed DNS query functionality
    console.log(chalk.yellow('1. Testing DNS record query (should work now)...'));
    
    const domain = 'gemini.yxhpy.xyz';
    const fakeTokenId = 'test-tunnel-id-12345';
    
    // Call the private method directly for testing
    const dnsRecords = await provider._queryExistingDnsRecords(domain);
    
    console.log(chalk.green('✅ DNS query successful!'));
    console.log(chalk.blue(`Found ${dnsRecords.length} DNS records:`));
    
    dnsRecords.forEach((record, i) => {
      console.log(chalk.gray(`  Record ${i + 1}: ${record.type} ${record.name} → ${record.content}`));
    });
    
    console.log(chalk.yellow('\n2. Testing smart DNS conflict resolution...'));
    
    // This should now work without the 400 error
    const result = await provider._smartResolveDnsConflict(fakeTokenId, domain);
    
    if (result) {
      console.log(chalk.green('✅ Smart DNS conflict resolution completed successfully'));
    } else {
      console.log(chalk.yellow('⚠️ Smart resolution completed but returned false (this may be expected)'));
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Test failed: ${error.message}`));
    console.log(chalk.gray(error.stack));
  }
}

testDnsConflictFix();