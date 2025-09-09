#!/usr/bin/env node

/**
 * Debug script to test and fix DNS headers issue
 * 
 * Problem: credentials.headers is undefined because getApiCredentials() 
 * returns {type, value} not {headers}
 * 
 * Solution: Use createApiHeaders(credentials) to generate headers
 */

import { CloudflareDomainManager } from './src/utils/cloudflare-domain-manager.js';
import chalk from 'chalk';

console.log(chalk.blue('🔧 Debug: DNS Headers Fix'));

async function debugDnsHeaders() {
  try {
    const domainManager = new CloudflareDomainManager();
    
    console.log(chalk.yellow('1. Testing getApiCredentials()...'));
    const credentials = await domainManager.getApiCredentials();
    
    if (credentials) {
      console.log(chalk.green('✅ Credentials found:'));
      console.log(chalk.gray(`  Type: ${credentials.type}`));
      console.log(chalk.gray(`  Value: ${credentials.value.substring(0, 10)}...`));
      console.log(chalk.gray(`  Has headers property: ${!!credentials.headers}`));
      
      console.log(chalk.yellow('\n2. Testing createApiHeaders()...'));
      const headers = domainManager.createApiHeaders(credentials);
      console.log(chalk.green('✅ Headers created:'));
      console.log(chalk.gray('  Headers:', JSON.stringify(headers, null, 2)));
      
      console.log(chalk.yellow('\n3. Testing actual DNS query with fixed headers...'));
      const testDomain = 'gemini.yxhpy.xyz';
      
      // Get Zone ID first
      const zoneId = await domainManager.getZoneId(testDomain);
      if (!zoneId) {
        console.log(chalk.red('❌ Could not get Zone ID'));
        return;
      }
      
      console.log(chalk.blue(`✅ Got Zone ID: ${zoneId}`));
      
      // Test DNS record query with proper headers
      const url = `${domainManager.apiBaseUrl}/zones/${zoneId}/dns_records?name=${testDomain}`;
      console.log(chalk.gray(`API URL: ${url}`));
      
      const response = await fetch(url, { headers });
      console.log(chalk.blue(`✅ Response status: ${response.status}`));
      
      if (response.ok) {
        const data = await response.json();
        console.log(chalk.green(`✅ Success: Found ${data.result.length} DNS records`));
        data.result.forEach((record, i) => {
          console.log(chalk.gray(`  Record ${i + 1}: ${record.type} ${record.name} → ${record.content}`));
        });
      } else {
        console.log(chalk.red(`❌ API Error: ${response.status} ${response.statusText}`));
        const errorData = await response.json().catch(() => ({}));
        if (errorData.errors) {
          errorData.errors.forEach(error => {
            console.log(chalk.red(`  Error: ${error.message} (Code: ${error.code})`));
          });
        }
      }
      
    } else {
      console.log(chalk.red('❌ No credentials found'));
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Debug failed: ${error.message}`));
    console.log(chalk.gray(error.stack));
  }
}

debugDnsHeaders();