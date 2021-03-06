var path = require("path");
var findRoot = require("find-root");
var chalk = require("chalk");
var fs = require("fs");
var _ = require("lodash");

const defaults = {
  verbose: false,
  showHelp: true,
  emitError: false,
  exclude: null,
  outputFile: null,
};

function DuplicatePackageCheckerPlugin(options) {
  this.options = _.extend({}, defaults, options);
}

function cleanPath(path) {
  return path.split("/node_modules/").join("/~/");
}

// Get closest package definition from path
function getClosestPackage(modulePath) {
  let root;
  let pkg;

  // Catch findRoot or require errors
  try {
    root = findRoot(modulePath);
    pkg = require(path.join(root, "package.json"));
  } catch (e) {
    return null;
  }

  // If the package.json does not have a name property, try again from
  // one level higher.
  // https://github.com/jsdnxx/find-root/issues/2
  // https://github.com/date-fns/date-fns/issues/264#issuecomment-265128399
  if (!pkg.name) {
    return getClosestPackage(path.resolve(root, ".."));
  }

  return {
    package: pkg,
    path: root
  };
}

DuplicatePackageCheckerPlugin.prototype.apply = function(compiler) {
  let verbose = this.options.verbose;
  let showHelp = this.options.showHelp;
  let emitError = this.options.emitError;
  let exclude = this.options.exclude;
  let outputFile = this.options.outputFile;

  compiler.plugin("emit", function(compilation, callback) {
    let context = compilation.compiler.context;
    let modules = {};

    function cleanPathRelativeToContext(modulePath) {
      let cleanedPath = cleanPath(modulePath);

      // Make relative to compilation context
      if (cleanedPath.indexOf(context) === 0) {
        cleanedPath = "." + cleanedPath.replace(context, "");
      }

      return cleanedPath;
    }

    compilation.modules.forEach(module => {
      if (!module.resource) {
        return;
      }

      let pkg;
      let packagePath;

      let closestPackage = getClosestPackage(module.resource);

      // Skip module if no closest package is found
      if (!closestPackage) {
        return;
      }

      pkg = closestPackage.package;
      packagePath = closestPackage.path;

      let modulePath = cleanPathRelativeToContext(packagePath);

      let version = pkg.version;

      modules[pkg.name] = modules[pkg.name] || [];

      let isSeen = _.find(modules[pkg.name], module => {
        return module.version === version;
      });

      let issuer =
          module.issuer && module.issuer.resource
              ? cleanPathRelativeToContext(module.issuer.resource)
              : null;

      if (!isSeen) {
        let entry = { version, path: [modulePath] };
        entry.issuer = [issuer];

        modules[pkg.name].push(entry);
      } else {
        isSeen.path.push(modulePath);
        isSeen.issuer.push(issuer);
      }
    });

    let duplicates = _.omitBy(modules, (instances, name) => {
      if (instances.length <= 1) {
        return true;
      }

      if (exclude) {
        instances = instances.filter(instance => {
          instance = Object.assign({ name }, instance);
          return !exclude(instance);
        });

        if (instances.length <= 1) {
          return true;
        }
      }

      return false;
    });

    const duplicateCount = Object.keys(duplicates).length;

    if (outputFile) {
      fs.writeFileSync(outputFile, JSON.stringify(duplicates));
    }

    if (duplicateCount) {
      let array = emitError ? compilation.errors : compilation.warnings;

      let i = 0;
      _.each(duplicates, (instances, name) => {
        let error =
          name +
          "\n" +
          chalk.reset("  Multiple versions of ") +
          chalk.green.bold(name) +
          chalk.white(` found:\n`);
        instances = instances.map(version => {
          let str = chalk.green.bold(version.version);
          _.uniq(version.path).forEach(path => {
            str += `\n      ${chalk.white.bold(path)}`;
          });
          if (verbose && version.issuer) {
            str += ` from ${chalk.white.bold(version.issuer)}`;
          }
          return str;
        });
        error += `    ${instances.join("\n    ")}\n`;
        // only on last warning
        if (showHelp && ++i === duplicateCount) {
          error += `\n${chalk.white.bold(
            "Check how you can resolve duplicate packages: "
          )}\nhttps://github.com/darrenscerri/duplicate-package-checker-webpack-plugin#resolving-duplicate-packages-in-your-bundle\n`;
        }
        array.push(new Error(error));
      });
    }

    callback();
  });
};

module.exports = DuplicatePackageCheckerPlugin;
