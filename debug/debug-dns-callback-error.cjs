#!/usr/bin/env node

/**
 * Debug DNS Callback Error Issue
 * Problem: "The callback argument must be of type function. Received undefined"
 * Location: DNS查询在多服务器验证时失败
 */

const dns = require('dns');
const util = require('util');

console.log('🔍 Debug DNS Callback Error');
console.log('===============================');

// Test 1: Check current DNS resolver methods
console.log('\n1. Available DNS resolver methods:');
console.log('dns.resolveCname:', typeof dns.resolveCname);
console.log('dns.resolve:', typeof dns.resolve);
console.log('dns.lookup:', typeof dns.lookup);

// Test 2: Test callback vs promise patterns
console.log('\n2. Testing callback patterns:');

// Callback pattern (traditional)
function testCallbackPattern() {
    console.log('\n  Testing callback pattern:');
    
    // Test with callback
    dns.resolveCname('google.com', (err, addresses) => {
        if (err) {
            console.log('    ❌ Callback pattern error:', err.message);
        } else {
            console.log('    ✅ Callback pattern success:', addresses);
        }
    });
}

// Promise pattern (modern)
async function testPromisePattern() {
    console.log('\n  Testing promise pattern:');
    
    try {
        const resolveCname = util.promisify(dns.resolveCname);
        const addresses = await resolveCname('google.com');
        console.log('    ✅ Promise pattern success:', addresses);
    } catch (err) {
        console.log('    ❌ Promise pattern error:', err.message);
    }
}

// Test 3: Reproduce the exact error
function reproduceError() {
    console.log('\n3. Reproducing exact error scenario:');
    
    // This will likely cause the error - calling without callback
    try {
        // This is what might be happening in the code
        const result = dns.resolveCname('gemini.yxhpy.xyz'); // Missing callback!
        console.log('    Unexpected success:', result);
    } catch (err) {
        console.log('    ❌ Error reproduced:', err.message);
    }
}

// Test 4: Test with specific DNS servers
function testSpecificServers() {
    console.log('\n4. Testing specific DNS servers:');
    
    // Cloudflare DNS: 1.1.1.1
    // Google DNS: 8.8.8.8
    
    const resolver1 = new dns.Resolver();
    resolver1.setServers(['1.1.1.1']);
    
    const resolver2 = new dns.Resolver();  
    resolver2.setServers(['8.8.8.8']);
    
    console.log('    Cloudflare resolver:', typeof resolver1.resolveCname);
    console.log('    Google resolver:', typeof resolver2.resolveCname);
    
    // Test callback requirement
    resolver1.resolveCname('google.com', (err, addresses) => {
        if (err) {
            console.log('    ❌ Cloudflare DNS error:', err.message);
        } else {
            console.log('    ✅ Cloudflare DNS success:', addresses);
        }
    });
}

// Run tests
console.log('\n开始分析DNS回调错误...');
testCallbackPattern();
testPromisePattern();
reproduceError();
testSpecificServers();

// Wait for async operations
setTimeout(() => {
    console.log('\n===============================');
    console.log('🏁 Debug 完成');
    
    console.log('\n📝 分析结果:');
    console.log('1. DNS查询方法必须提供回调函数');
    console.log('2. 错误可能发生在调用dns.resolveCname时没有传递callback参数');
    console.log('3. 需要检查代码中DNS查询的调用方式');
    console.log('4. 建议使用util.promisify或确保回调函数正确传递');
}, 2000);