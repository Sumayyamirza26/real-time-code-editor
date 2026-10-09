const CodeExecutor = require('./utils/codeExecutor');

// Test 1: JavaScript
const jsEx = new CodeExecutor(null, 'console.log("Hello JS"); console.log(1+2);', 'javascript', false);
jsEx.start({
  onOutput: (d) => process.stdout.write('[JS OUT] ' + d),
  onError:  (d) => process.stderr.write('[JS ERR] ' + d),
  onClose:  (code, err) => {
    if (err) console.error('[JS] spawn error:', err);
    else console.log('[JS] exit code:', code);

    // Test 2: Python
    const pyCode = 'print("Hello Python")\nfor i in range(3):\n    print(f"  i={i}")\n';
    const pyEx = new CodeExecutor(null, pyCode, 'python', false);
    pyEx.start({
      onOutput: (d) => process.stdout.write('[PY OUT] ' + d),
      onError:  (d) => process.stderr.write('[PY ERR] ' + d),
      onClose:  (pyCode2, pyErr) => {
        if (pyErr) console.error('[PY] spawn error:', pyErr);
        else console.log('[PY] exit code:', pyCode2);

        // Test 3: C++
        const cppCode = '#include<iostream>\nusing namespace std;\nint main(){\n  cout<<"Hello C++"<<endl;\n  int x=5,y=3;\n  cout<<"Sum: "<<(x+y)<<endl;\n  return 0;\n}\n';
        const cppEx = new CodeExecutor(null, cppCode, 'cpp', false);
        cppEx.start({
          onOutput: (d) => process.stdout.write('[CPP OUT] ' + d),
          onError:  (d) => process.stderr.write('[CPP ERR] ' + d),
          onClose:  (code3, err3) => {
            if (err3) console.error('[CPP] spawn error:', err3);
            else console.log('[CPP] exit code:', code3);
            console.log('\nAll tests done!');
          }
        });
      }
    });
  }
});

