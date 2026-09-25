import { spawn } from 'node:child_process';

const knownHostsFile = process.platform === 'win32' ? 'NUL' : '/dev/null';
const tunnel = spawn('ssh', [
  '-T',
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ServerAliveInterval=30',
  '-o', 'StrictHostKeyChecking=no',
  '-o', `UserKnownHostsFile=${knownHostsFile}`,
  '-R', '80:127.0.0.1:8787',
  'serveo.net',
], { stdio: 'inherit' });

tunnel.on('error', (error) => {
  console.error('Unable to start the SSH tunnel:', error.message);
  process.exit(1);
});

tunnel.on('exit', (code) => process.exit(code ?? 0));
