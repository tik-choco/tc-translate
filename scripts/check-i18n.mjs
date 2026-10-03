import fs from 'node:fs/promises'
import ts from 'typescript'

const directory = new URL('../src/i18n/', import.meta.url)
const locales = ['en', 'ja', 'zh-CN', 'zh-TW']
const errors = []
let catalogs = 0
let keys = 0

// Read literal catalogs through the TS parser, without importing browser code.
function readObject(expression, location) {
  while (ts.isSatisfiesExpression(expression) || ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)) {
    expression = expression.expression
  }
  if (ts.isCallExpression(expression) && expression.expression.getText() === 'defineMessages') {
    expression = expression.arguments[0]
  }
  if (!ts.isObjectLiteralExpression(expression)) throw new Error(`${location}: expected a literal catalog`)
  const result = {}
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) throw new Error(`${location}: expected a message property`)
    const key = ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name) ? property.name.text : undefined
    if (key === undefined) throw new Error(`${location}: expected a literal key`)
    if (Object.hasOwn(result, key)) errors.push(`${location}: duplicate key ${key}`)
    result[key] = ts.isStringLiteralLike(property.initializer)
      ? property.initializer.text : readObject(property.initializer, `${location}/${key}`)
  }
  return result
}

const placeholders = value => [...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).sort().join('|')
for (const file of (await fs.readdir(directory)).filter(file => file.endsWith('.ts')).sort()) {
  const source = ts.createSourceFile(file, await fs.readFile(new URL(file, directory), 'utf8'), ts.ScriptTarget.Latest, true)
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.name.text.endsWith('Messages') || !declaration.initializer) continue
      const bundle = readObject(declaration.initializer, file)
      if (!bundle.en) throw new Error(`${file}: missing reference locale en`)
      catalogs += 1
      keys += Object.keys(bundle.en).length
      for (const locale of locales) {
        const table = bundle[locale]
        if (!table || typeof table !== 'object') { errors.push(`${file}: missing locale ${locale}`); continue }
        for (const key of Object.keys(bundle.en)) {
          const value = table[key]
          if (typeof value !== 'string' || !value.trim()) errors.push(`${file}/${locale}: missing or empty ${key}`)
          else if (typeof bundle.en[key] === 'string' && placeholders(value) !== placeholders(bundle.en[key])) {
            errors.push(`${file}/${locale}: placeholder mismatch for ${key}`)
          }
        }
        for (const key of Object.keys(table)) {
          if (!Object.hasOwn(bundle.en, key)) errors.push(`${file}/${locale}: orphan key ${key}`)
        }
      }
    }
  }
}
if (!catalogs) throw new Error('No message catalogs found')
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`i18n complete: ${catalogs} catalogs, ${keys} keys, ${locales.join(', ')}; no empty/orphan keys or placeholder mismatches.`)
}
