import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '@tailwindcss/node'

const directory = join(dirname(fileURLToPath(import.meta.url)), '../styles')
const output = new Map<string, string>()

export async function compileStyles() {
  await Promise.all(
    readdirSync(directory)
      .filter((name) => name.endsWith('.css'))
      .map(async (name) => {
        const compiler = await compile(readFileSync(join(directory, name), 'utf8'), {
          base: directory,
          onDependency() {},
        })
        output.set(name, compiler.build([]))
      }),
  )
}

export function compiledStyle(name: string): string {
  const css = output.get(name)
  if (!css) throw new Error('Compile styles before inspecting ' + name)
  return css
}
