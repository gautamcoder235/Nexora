import { invoke } from "@tauri-apps/api/core";

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
}

export interface FileDependencyInfo {
  path: string;
  imports: {
    source: string;
    resolvedPath: string | null;
    symbols: string[];
  }[];
  exports: string[];
}

export interface RepositoryAnalysisResult {
  files: Record<string, FileDependencyInfo>;
  dependencyGraph: Record<string, string[]>;
}

/**
 * Perform a lightweight symbol and import/export analysis of a target workspace directory.
 * V1 reads the file list recursively, parses TS/JS imports and exports, and builds a dependency map.
 */
export async function analyzeRepository(repoPath: string): Promise<RepositoryAnalysisResult> {
  const normalizedRepoPath = repoPath.replace(/\\/g, '/');
  const allAbsoluteFiles: string[] = [];
  
  async function traverse(dir: string) {
    try {
      const nodes = await invoke<FileNode[]>('list_directory', { dirPath: dir });
      for (const node of nodes) {
        if (node.is_dir) {
          await traverse(node.path);
        } else {
          allAbsoluteFiles.push(node.path.replace(/\\/g, '/'));
        }
      }
    } catch (e) {
      console.error(`Error traversing directory ${dir}:`, e);
    }
  }
  
  await traverse(normalizedRepoPath);
  
  const allFilesRelative = allAbsoluteFiles.map(abs => {
    let rel = abs;
    if (abs.startsWith(normalizedRepoPath)) {
      rel = abs.slice(normalizedRepoPath.length);
      if (rel.startsWith('/')) {
        rel = rel.slice(1);
      }
    }
    return rel;
  });

  const files: Record<string, FileDependencyInfo> = {};
  const dependencyGraph: Record<string, string[]> = {};

  function resolveImportPath(importingFileRelative: string, importSource: string): string | null {
    let source = importSource;
    if (source.startsWith('@/')) {
      source = 'src/' + source.slice(2);
    }

    if (!source.startsWith('.')) {
      return null;
    }

    const parts = importingFileRelative.split('/');
    parts.pop();
    const currentDir = parts.join('/');

    const importParts = source.split('/');
    const resolvedParts = currentDir ? currentDir.split('/') : [];

    for (const part of importParts) {
      if (part === '.' || part === '') {
        continue;
      } else if (part === '..') {
        resolvedParts.pop();
      } else {
        resolvedParts.push(part);
      }
    }

    const baseResolved = resolvedParts.join('/');
    
    const candidates = [
      baseResolved,
      baseResolved + '.ts',
      baseResolved + '.tsx',
      baseResolved + '.js',
      baseResolved + '.jsx',
      baseResolved + '/index.ts',
      baseResolved + '/index.tsx',
      baseResolved + '/index.js',
      baseResolved + '/index.jsx',
    ];

    for (const candidate of candidates) {
      const normalized = candidate.replace(/\/+/g, '/');
      if (allFilesRelative.includes(normalized)) {
        return normalized;
      }
    }

    return null;
  }

  function parseImportsAndExports(content: string, fileRelative: string): {
    imports: { source: string; resolvedPath: string | null; symbols: string[] }[];
    exports: string[];
  } {
    const fileImports: { source: string; resolvedPath: string | null; symbols: string[] }[] = [];
    const fileExports: string[] = [];

    const importRegex = /import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const symbolStr = match[1] ? match[1].trim() : '';
      const source = match[2];
      const symbols: string[] = [];

      if (symbolStr) {
        if (symbolStr.startsWith('{') && symbolStr.endsWith('}')) {
          const cleaned = symbolStr.slice(1, -1);
          symbols.push(...cleaned.split(',').map(s => s.trim()).filter(Boolean));
        } else if (symbolStr.includes('* as')) {
          symbols.push(symbolStr);
        } else {
          symbols.push(symbolStr);
        }
      }

      const resolvedPath = resolveImportPath(fileRelative, source);
      fileImports.push({ source, resolvedPath, symbols });
    }

    const requireRegex = /(?:const|let|var)\s+([\s\S]*?)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      const symbolStr = match[1].trim();
      const source = match[2];
      const symbols: string[] = [];

      if (symbolStr.startsWith('{') && symbolStr.endsWith('}')) {
        const cleaned = symbolStr.slice(1, -1);
        symbols.push(...cleaned.split(',').map(s => s.trim()).filter(Boolean));
      } else {
        symbols.push(symbolStr);
      }

      const resolvedPath = resolveImportPath(fileRelative, source);
      fileImports.push({ source, resolvedPath, symbols });
    }

    const namedExportRegex = /export\s+(?:const|let|var|function\*?|class|type|interface)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    while ((match = namedExportRegex.exec(content)) !== null) {
      fileExports.push(match[1]);
    }

    const exportBracketRegex = /export\s+\{([^}]+)\}/g;
    while ((match = exportBracketRegex.exec(content)) !== null) {
      const cleaned = match[1];
      fileExports.push(...cleaned.split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));
    }

    const defaultExportRegex = /export\s+default\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    while ((match = defaultExportRegex.exec(content)) !== null) {
      if (!['class', 'function', 'interface'].includes(match[1])) {
        fileExports.push(match[1]);
      } else {
        fileExports.push('default');
      }
    }

    return {
      imports: fileImports,
      exports: Array.from(new Set(fileExports))
    };
  }

  for (let i = 0; i < allAbsoluteFiles.length; i++) {
    const absolutePath = allAbsoluteFiles[i];
    const relativePath = allFilesRelative[i];
    
    if (/\.(ts|tsx|js|jsx)$/.test(relativePath)) {
      try {
        const content = await invoke<string>('read_project_file', { path: absolutePath });
        const { imports, exports } = parseImportsAndExports(content, relativePath);
        
        files[relativePath] = {
          path: relativePath,
          imports,
          exports
        };

        const dependencies = imports
          .map(imp => imp.resolvedPath)
          .filter((path): path is string => path !== null);
          
        dependencyGraph[relativePath] = Array.from(new Set(dependencies));
      } catch (e) {
        console.error(`Error reading or parsing file ${relativePath}:`, e);
      }
    }
  }

  return {
    files,
    dependencyGraph
  };
}
