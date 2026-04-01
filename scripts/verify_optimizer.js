const { optimizeValue } = require('../src/optimizer');
const path = require('path');

const mockVars = {
    'APPDATA': 'C:\\Users\\User\\AppData\\Roaming',
    'LOCALAPPDATA': 'C:\\Users\\User\\AppData\\Local',
    'JAVA_HOME': 'C:\\Program Files\\Java\\jdk-17'
};

function testOptimization() {
    console.log('--- Testing Optimization Logic ---');
    
    const tests = [
        {
            name: 'Single path replacement',
            value: 'C:\\Users\\User\\AppData\\Roaming\\npm',
            expectedContains: '%APPDATA%'
        },
        {
            name: 'Multi-path replacement',
            value: 'C:\\Users\\User\\AppData\\Roaming\\npm;C:\\Program Files\\Java\\jdk-17\\bin;D:\\Other',
            expectedContains: '%APPDATA%'
        },
        {
            name: 'No replacement possible',
            value: 'D:\\Generic\\Path',
            expectedContains: 'D:\\Generic\\Path'
        }
    ];

    tests.forEach(t => {
        const result = optimizeValue('TEST_VAR', t.value, mockVars);
        console.log(`Test: ${t.name}`);
        console.log(`Original: ${t.value}`);
        console.log(`Optimized: ${result.optimizedValue}`);
        console.log(`Savings: ${result.lengthReduced}`);
        
        const passed = result.optimizedValue.includes(t.expectedContains) || result.optimizedValue === t.expectedContains;
        console.log(`Result: ${passed ? 'PASSED' : 'FAILED'}`);
        console.log('---');
    });
}

testOptimization();
