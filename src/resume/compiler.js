import fs from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

function quoteShellArgument(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

/**
 * Compiles a generated LaTeX resume into a PDF using two pdflatex passes.
 * @param {string} texFilePath Path to the LaTeX source file.
 * @returns {Promise<string>} Path to the compiled PDF file.
 */
export async function compileResume(texFilePath) {
  const directory = path.dirname(texFilePath);
  const command = `pdflatex -interaction=nonstopmode -output-directory=${quoteShellArgument(directory)} ${quoteShellArgument(texFilePath)}`;
  const options = {
    env: {
      ...process.env,
      PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/usr/texbin:/Library/TeX/texbin`,
    },
  };
  const pdfPath = path.join(directory, `${path.basename(texFilePath, path.extname(texFilePath))}.pdf`);
  const finalPdfPath = path.join(directory, 'Shashikanth_Resume.pdf');
  const errors = [];

  for (let pass = 0; pass < 2; pass += 1) {
    try {
      await execAsync(command, options);
    } catch (error) {
      errors.push(error);
    }
  }

  if (!fs.existsSync(pdfPath)) {
    for (const error of errors) {
      console.error(`[Compiler Error] stderr:\n${error.stderr || ''}`);
      console.error(`[Compiler Error] stdout:\n${error.stdout || ''}`);
    }
    const error = errors.at(-1);
    throw new Error(`pdflatex failed: ${error?.stderr || error?.message || 'PDF file was not produced.'}`);
  }

  await rename(pdfPath, finalPdfPath);

  await Promise.all([
    unlink(path.join(directory, 'resume.aux')),
    unlink(path.join(directory, 'resume.log')),
  ].map((operation) => operation.catch(() => undefined)));

  return finalPdfPath;
}
