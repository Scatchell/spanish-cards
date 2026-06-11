import fs from 'node:fs';

const [environment, fileName, exampleFileName = `${fileName}.example`] = process.argv.slice(2);

if (!environment || !fileName) {
  console.error('Usage: node scripts/require-env-file.mjs <environment> <env-file> [example-file]');
  process.exit(1);
}

if (!fs.existsSync(fileName)) {
  console.error(
    `Missing ${environment} environment file: ${fileName}. Copy ${exampleFileName} to ${fileName} and update it before running this command.`,
  );
  process.exit(1);
}
