#!/usr/bin/env node
/**
 * Repair session logs whose forks fail to reload after a DSH restart.
 *
 * A fork copies the parent session's event log verbatim. When the parent
 * contains events written by other plugins that this harness build does not
 * recognize and that are not marked `ignorable` in their envelope — for
 * example the `session/distill-review-request` event written by
 * `@loserfox/distill` before its #5 fix — the forked log is refused by the
 * cold-load read path with `SessionFormatUnsupportedError` ("unknown to this
 * harness and not marked ignorable"), so the conversation cannot be reopened
 * after a restart.
 *
 * The plugin releases that wrote those events have since stopped writing them,
 * but logs that already contain them need a one-time migration: this script
 * rewrites only the offending events, adding `ignorable: true` to their
 * envelope so the read path safely skips them. Every other byte of the log is
 * preserved, and the zstd frame layout (one frame for the header record, one
 * frame for the event records) is reproduced exactly as the backend writes it.
 *
 * Usage:
 *   node scripts/repair-session-logs.mjs [--root <dir>] [--dry-run] [log.jsonl.zstd ...]
 *
 * With no explicit paths it discovers every `session.jsonl.zstd` under
 * `--root` (default: `$DSH_HOME/sessions`, else `~/.dsh/sessions`). Only logs
 * that actually contain an un-ignorable target event are touched; each is
 * backed up to `<file>.bak` before rewriting.
 *
 * Stop DSH before running this against the currently-live session: a live
 * session's log is being appended while the process runs, so in-place repair
 * of it is unsafe and may be incomplete.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'

const TARGET_EVENT_TYPE = 'session/distill-review-request'
const ZSTD_MAGIC = 4247762216 // 0xFD2FB528

/**
 * Locate complete zstd frames without decompressing them (mirrors the DSH
 * JSONL backend's `scanZstdFrames`). Returns complete frame byte ranges and,
 * when the buffer ends inside a frame, that frame's start offset.
 */
function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return { frames, tornStart: start }
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`not a zstd session log: invalid frame magic at byte ${offset}`)
    }
    offset += 4
    if (offset === buffer.length) return { frames, tornStart: start }
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 24) !== 0) throw new Error(`not a zstd session log: reserved frame-header bit at byte ${offset - 1}`)
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : (1 << contentSizeFlag)
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start }
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) throw new Error(`not a zstd session log: reserved block type at byte ${offset - 3}`)
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start }
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return { frames }
}

/** Decode every complete frame and return the concatenated JSONL plaintext. */
function decodeAllFrames(buffer) {
  const { frames, tornStart } = scanZstdFrames(buffer)
  if (frames.length === 0) throw new Error('empty or header-less zstd session log')
  if (tornStart !== undefined) {
    throw new Error('refusing to repair a log with a torn (incomplete) final frame; stop DSH and retry')
  }
  const parts = []
  for (const { start, end } of frames) {
    parts.push(zstdDecompressSync(buffer.subarray(start, end)))
  }
  return Buffer.concat(parts).toString('utf8')
}

/**
 * Split plaintext into the header line and event lines, marking every target
 * event `ignorable: true`. Returns the new event-line list and how many
 * events were changed.
 */
function repairPlaintext(plaintext) {
  const lines = plaintext.split('\n')
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  if (lines.length < 2) throw new Error('log has no event records')
  const header = lines[0]
  if (!header.startsWith('{"type":"session"')) {
    throw new Error('log first line is not a session header')
  }
  const eventLines = lines.slice(1)
  let modified = 0
  for (let i = 0; i < eventLines.length; i += 1) {
    if (eventLines[i] === '') continue
    let event
    try {
      event = JSON.parse(eventLines[i])
    } catch {
      continue // preserve non-JSON lines byte-for-byte; the reader owns their diagnostics
    }
    if (event.type !== TARGET_EVENT_TYPE || event.ignorable === true) continue
    event.ignorable = true
    eventLines[i] = JSON.stringify(event)
    modified += 1
  }
  return { header, eventLines, modified }
}

/** Re-encode a header line and event lines into the backend's two-frame layout. */
function encode(header, eventLines) {
  const headerFrame = zstdCompressSync(Buffer.from(`${header}\n`, 'utf8'))
  const eventFrame = zstdCompressSync(Buffer.from(`${eventLines.join('\n')}\n`, 'utf8'))
  return Buffer.concat([headerFrame, eventFrame])
}

/** Count un-ignorable target events in a log (used to decide whether repair is needed). */
function countTargetEvents(plaintext) {
  let count = 0
  for (const line of plaintext.split('\n')) {
    if (line === '') continue
    if (line.startsWith('{"type":"session"')) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.type === TARGET_EVENT_TYPE && event.ignorable !== true) count += 1
  }
  return count
}

/** Repair one log file. Returns a status string. */
function repairFile(file, dryRun) {
  const buffer = readFileSync(file)
  const plaintext = decodeAllFrames(buffer)
  const affected = countTargetEvents(plaintext)
  if (affected === 0) return { file, status: 'clean', affected: 0 }
  const { header, eventLines, modified } = repairPlaintext(plaintext)
  if (modified !== affected) {
    throw new Error(`${file}: repair count mismatch (expected ${affected}, modified ${modified})`)
  }
  if (dryRun) return { file, status: 'dry-run', affected: modified }

  const backup = `${file}.bak`
  copyFileSync(file, backup)
  const output = encode(header, eventLines)

  // Self-verify before replacing the original: re-decode the exact bytes we are
  // about to write and confirm the header survives and every target event is
  // now ignorable.
  const roundTrip = decodeAllFrames(output)
  if (countTargetEvents(roundTrip) !== 0) {
    throw new Error(`${file}: self-verification failed (target events still un-ignorable)`)
  }
  if (!roundTrip.startsWith(header + '\n')) {
    throw new Error(`${file}: self-verification failed (header changed)`)
  }

  writeFileSync(file, output)
  return { file, status: 'repaired', affected: modified }
}

/** Recursively discover session logs under a root directory. */
function discoverLogs(root) {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name === 'session.jsonl.zstd') {
        found.push(full)
      }
    }
  }
  if (existsSync(root)) walk(root)
  return found
}

function parseArgs(argv) {
  const opts = { dryRun: false, root: undefined, files: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      opts.dryRun = true
    } else if (arg === '--root') {
      opts.root = argv[++i]
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`)
    } else {
      opts.files.push(arg)
    }
  }
  return opts
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const defaultRoot = process.env.DSH_HOME
    ? join(process.env.DSH_HOME, 'sessions')
    : join(homedir(), '.dsh', 'sessions')
  const files = opts.files.length > 0
    ? opts.files
    : discoverLogs(opts.root ?? defaultRoot)
  if (files.length === 0) {
    console.error('no session logs found')
    process.exitCode = 1
    return
  }
  let repaired = 0
  let clean = 0
  for (const file of files) {
    try {
      const result = repairFile(file, opts.dryRun)
      if (result.status === 'clean') clean += 1
      else repaired += 1
      console.log(`${result.status.padEnd(8)} ${result.affected} event(s)  ${file}`)
    } catch (error) {
      console.error(`error    ${file}: ${errorMessage(error)}`)
      process.exitCode = 1
    }
  }
  console.log(`\n${repaired} repaired, ${clean} clean, ${files.length} total${opts.dryRun ? ' (dry run)' : ''}`)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

main()
