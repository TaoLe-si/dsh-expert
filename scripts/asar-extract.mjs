#!/usr/bin/env node
/**
 * Read files and directories out of an Electron `app.asar` archive.
 *
 * The DSH Desktop Harness ships its plugin packages inside `app.asar`, which Node
 * cannot open as a directory. This is the smallest reader that can list, print, and
 * extract them, so the baseline fixture in `test/fixtures/` stays reproducible
 * instead of magic.
 *
 * The archive format is a pickle header followed by concatenated file contents:
 *   u32 @ 0   size of the first pickle (always 4)
 *   u32 @ 4   header pickle size
 *   u32 @ 8   header pickle size - 4
 *   u32 @ 12  JSON header string length (starts at byte 16)
 *   file data starts at: 8 + headerPickleSize
 *
 * Usage:
 *   node scripts/asar-extract.mjs lsdir  <path-in-asar>
 *   node scripts/asar-extract.mjs cat    <path-in-asar>
 *   node scripts/asar-extract.mjs extract <path-in-asar> <out-dir>
 *   node scripts/asar-extract.mjs find   <regex> [path-in-asar]
 *
 * Environment:
 *   DSH_ASAR           path to app.asar        (default: the Windows Desktop install)
 *   DSH_ASAR_UNPACKED  path to app.asar.unpacked (default: beside the default asar)
 *
 * @module dsh-expert/scripts/asar-extract
 */
import fs from 'node:fs'
import path from 'node:path'

const ASAR = process.env.DSH_ASAR ?? 'D:/DSH/DSH NEXT/resources/app.asar'
const UNPACKED = process.env.DSH_ASAR_UNPACKED ?? 'D:/DSH/DSH NEXT/resources/app.asar.unpacked'

let cached = null

/** Parse and memoize the archive header. */
function loadHeader() {
  if (cached !== null) return cached
  const fd = fs.openSync(ASAR, 'r')
  const head = Buffer.alloc(16)
  fs.readSync(fd, head, 0, 16, 0)
  const pickleSize = head.readUInt32LE(4)
  const stringLength = head.readUInt32LE(12)
  const buffer = Buffer.alloc(stringLength)
  let read = 0
  while (read < stringLength) {
    const chunk = fs.readSync(fd, buffer, read, stringLength - read, 16 + read)
    if (chunk <= 0) break
    read += chunk
  }
  fs.closeSync(fd)
  const raw = buffer.toString('utf8', 0, stringLength).replace(/[\u0000]+$/g, '')
  cached = { header: JSON.parse(raw), dataStart: 8 + pickleSize }
  return cached
}

/** Resolve an in-archive path to its header node. */
function resolveNode(target) {
  let current = loadHeader().header
  for (const part of target.split('/').filter(Boolean)) {
    if (!current.files || !current.files[part]) return null
    current = current.files[part]
  }
  return current
}

/** Read a whole range, tolerating short reads. */
function readFully(fd, size, offset) {
  const buffer = Buffer.alloc(size)
  let read = 0
  while (read < size) {
    const chunk = fs.readSync(fd, buffer, read, size - read, offset + read)
    if (chunk <= 0) break
    read += chunk
  }
  return buffer.subarray(0, read)
}

/** Read one file's bytes, following the unpacked indirection when present. */
function readFileInAsar(target, node) {
  const entry = node ?? resolveNode(target)
  if (!entry || entry.files) return null
  if (entry.unpacked && fs.existsSync(path.join(UNPACKED, target))) {
    return fs.readFileSync(path.join(UNPACKED, target))
  }
  const { dataStart } = loadHeader()
  const fd = fs.openSync(ASAR, 'r')
  const buffer = readFully(fd, Number(entry.size), dataStart + Number(entry.offset))
  fs.closeSync(fd)
  return buffer
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'lsdir': {
    const node = resolveNode(args[0] ?? '')
    if (!node?.files) {
      console.log('NOT A DIRECTORY')
      process.exitCode = 1
      break
    }
    for (const key of Object.keys(node.files).sort()) console.log(key + (node.files[key].files ? '/' : ''))
    break
  }
  case 'cat': {
    const buffer = readFileInAsar(args[0])
    if (buffer === null) {
      console.log('NOT FOUND')
      process.exitCode = 1
      break
    }
    process.stdout.write(buffer)
    break
  }
  case 'extract': {
    const prefix = args[0]
    const outDir = args[1]
    const node = resolveNode(prefix)
    if (!node) {
      console.log('NOT FOUND ' + prefix)
      process.exitCode = 1
      break
    }
    let count = 0
    const walk = (entry, relative) => {
      if (entry.files) {
        for (const key of Object.keys(entry.files)) walk(entry.files[key], relative ? relative + '/' + key : key)
        return
      }
      const buffer = readFileInAsar(relative ? prefix + '/' + relative : prefix, entry)
      if (buffer === null) return
      const destination = path.join(outDir, relative || path.basename(prefix))
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, buffer)
      count += 1
    }
    walk(node, '')
    console.log(`ok ${prefix} -> ${count} files`)
    break
  }
  case 'find': {
    const pattern = new RegExp(args[0])
    const node = resolveNode(args[1] ?? '')
    const walk = (entry, relative) => {
      if (entry.files) {
        for (const key of Object.keys(entry.files)) walk(entry.files[key], relative ? relative + '/' + key : key)
        return
      }
      if (pattern.test(relative)) console.log(relative)
    }
    if (node) walk(node, '')
    break
  }
  default:
    console.log('usage: asar-extract.mjs lsdir|cat|extract|find ...')
    process.exitCode = 1
}
