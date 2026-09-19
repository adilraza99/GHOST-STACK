const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.js')) {
      results.push(file);
    }
  });
  return results;
}

describe('Architecture boundaries', () => {
  const srcPath = path.resolve(__dirname, '../../src');
  const domainPath = path.join(srcPath, 'domain');
  const applicationPath = path.join(srcPath, 'application');
  const interfacesPath = path.join(srcPath, 'interfaces');

  describe('Domain Layer', () => {
    it('should not import infrastructure, application, or interfaces', () => {
      const files = walk(domainPath);
      files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toMatch(/require\(.*infrastructure.*\)/);
        expect(content).not.toMatch(/require\(.*application.*\)/);
        expect(content).not.toMatch(/require\(.*interfaces.*\)/);
        expect(content).not.toMatch(/require\(.*mongoose.*\)/);
        expect(content).not.toMatch(/require\(.*express.*\)/);
      });
    });
  });

  describe('Application Layer', () => {
    it('should not import infrastructure implementations or interfaces', () => {
      const files = walk(applicationPath);
      files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toMatch(/require\(.*interfaces.*\)/);
        expect(content).not.toMatch(/require\(.*mongoose.*\)/);
        expect(content).not.toMatch(/require\(.*express.*\)/);
      });
    });
  });

  describe('Interfaces/Controllers', () => {
    it('should not import Mongoose directly', () => {
      const controllersPath = path.join(interfacesPath, 'http', 'controllers');
      const files = walk(controllersPath);
      files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toMatch(/require\(.*mongoose.*\)/);
      });
    });

    it('should not instantiate Domain entities directly (must use application services)', () => {
      const controllersPath = path.join(interfacesPath, 'http', 'controllers');
      const files = walk(controllersPath);
      files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        // A controller should not be doing `new Deployment(...)` or requiring entities
        expect(content).not.toMatch(/require\(.*domain\/entities.*\)/);
      });
    });
  });
});
