const CodeExecutor = require('./utils/codeExecutor');

// Test Docker C++ execution
const cppCode = '#include<iostream>\nusing namespace std;\nint main(){\n  cout<<"Hello C++ Docker"<<endl;\n  int x=5,y=3;\n  cout<<"Sum: "<<(x+y)<<endl;\n  return 0;\n}\n';

const ex = new CodeExecutor('test-room', cppCode, 'cpp', true);
ex.start({
  onOutput: (d) => process.stdout.write('[CPP-DOCKER OUT] ' + d),
  onError:  (d) => process.stderr.write('[CPP-DOCKER ERR] ' + d),
  onClose:  (code, err) => {
    if (err) console.error('[CPP-DOCKER] spawn error:', err);
    else console.log('[CPP-DOCKER] exit code:', code);
  }
});

