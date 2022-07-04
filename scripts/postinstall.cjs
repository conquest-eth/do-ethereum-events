const fs = require('fs');
const path = require('path');

// let logs = '';
// const console = {
//   log(message) {
//     logs += `\n` + message;
//     fs.writeFileSync('log.txt', logs);
//   },
//   error(message) {
//     logs += `\nERRROR: ` + message;
//     fs.writeFileSync('log.txt', logs);
//   },
// };

const root = path.parse(process.cwd()).root;

function getPackageJSONPath(startPath) {
  startPath = startPath || process.cwd();

  let searchPath = startPath;
  let fileFound = false;
  let filepath;
  while (!fileFound) {
    filepath = path.join(searchPath, 'package.json');
    fileFound = fs.existsSync(filepath);
    if (!fileFound) {
      const newPath = path.join(searchPath, '..');
      if (
        newPath === searchPath ||
        newPath === root ||
        newPath === '.' ||
        newPath === '..'
      ) {
        break;
      }
      searchPath = newPath;
    }
  }

  if (fileFound) {
    return path.normalize(filepath);
  }
}

// from https://stackoverflow.com/a/26038979
function copyFileSync(source, target) {
  var targetFile = target;
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isDirectory()) {
      targetFile = path.join(target, path.basename(source));
    }
  }
  fs.writeFileSync(targetFile, fs.readFileSync(source));
}

function copyFolderRecursiveSync(source, target) {
  var files = [];
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach(function (file) {
      var curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, path.join(target, file));
      } else {
        copyFileSync(curSource, target);
      }
    });
  }
}

function copy(destination) {
  if (fs.existsSync(destination)) {
    fs.rmSync(destination, { recursive: true });
  }
  fs.mkdirSync(destination, { recursive: true });

  // TODO automate from package.json "files"
  fs.copyFileSync(
    path.join(__dirname, '../tsconfig.json'),
    path.join(destination, 'tsconfig.json'),
  );
  fs.copyFileSync(
    path.join(__dirname, '../env.d.ts'),
    path.join(destination, 'env.d.ts'),
  );
  copyFolderRecursiveSync(
    path.join(__dirname, '../lib/'),
    path.join(destination, 'lib'),
  );
  copyFolderRecursiveSync(
    path.join(__dirname, '../src/'),
    path.join(destination, 'src'),
  );
}

let filepath;
if (process.env.INIT_CWD) {
  filepath = getPackageJSONPath(process.env.INIT_CWD);
}

if (!filepath) {
  console.error(
    `could not find package.json of parent package${
      process.env.INIT_CWD ? '' : ' (no INIT_CWD)'
    }`,
  );
} else {
  const content = fs.readFileSync(filepath, 'utf8');
  const json = JSON.parse(content);
  if (json.typescriptLibraries) {
    if (typeof json.typescriptLibraries !== 'string') {
      console.error(
        `typescriptLibraries is expectedted to be a string field in package.json`,
      );
      process.exit(1);
    }
    const currentPackage = process.env['npm_config_dir'] || process.cwd();
    if (!currentPackage) {
      // console.log('no config_dir')
      process.exit(0);
    }
    const p = path.normalize(path.join(currentPackage, 'package.json'));
    if (p === filepath) {
      // console.log('skip as same package')
      process.exit(0);
    }
    if (!fs.existsSync(p)) {
      console.error(`current package package.json not found`);
      process.exit(1);
    }

    const packageName = process.env['npm_package_name'];
    const destination = path.join(
      path.dirname(filepath),
      json.typescriptLibraries,
      packageName,
    );
    // const source = process.env['npm_config_dir'];
    // console.log({source, destination});
    copy(destination);
  } else {
    console.error(`typescriptLibraries not set`);
  }
}
