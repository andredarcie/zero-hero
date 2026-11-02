// Comprime a música, os leitos de ambiente e os efeitos para o que o jogo baixa. Os WAV originais moram em
// tools/audio-masters/, fora de public/, e só os MP3 vão para o site. Precisa de ffmpeg no PATH.
//
//   node tools/encode-audio.mjs
//
// MP3 põe um silêncio pequeno no começo, de tamanho que varia por navegador, e isso estalaria num
// loop. Por isso cada loop sai com a própria cauda antes e o próprio começo depois (WRAP_S): o
// SoundManager toca só o miolo, e qualquer atraso do decodificador cai dentro de material que já é
// contínuo. A duração do miolo é a tabela em SoundManager (`seconds`).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASTERS = path.join(ROOT, 'tools', 'audio-masters');
const OUT = path.join(ROOT, 'public', 'assets', 'audio');
const WRAP_S = 0.25;

const LOOPS = [
  ['music-valley', '96k'],
  ['music-lullaby', '96k'],
  ['ambience-day', '64k'],
  ['ambience-night', '64k'],
  ['ambience-water', '64k'],
  ['ambience-rain', '64k'],
  ['music-layer-water', '64k'],
  ['music-layer-fire', '64k'],
];
// Os efeitos também: são mono, e 64k sobra. Só os passos ficam em WAV, porque têm 60 ms e o MP3 não
// encolhe tão pouco. O SoundManager corta o silêncio do começo, para o som sair junto com o gesto.
// O capim e a água são quase só ruído, que é o que o MP3 mais come, e por isso levam mais.
const NOISY = ['grass-cut', 'splash'];
const ONE_SHOTS = [
  'bridge-built', 'bridge-plank', 'grass-cut', 'hammer', 'heart', 'ignite', 'item-pickup', 'rock-smash',
  'shop-close', 'shop-open', 'singing-bowl', 'splash', 'title-impact', 'tree-fall', 'water-drop', 'wood-chop',
].map((name) => [name, NOISY.includes(name) ? '128k' : '64k']);

/** O WAV de 16 bits daqui: onde começa o áudio, quanto ele tem e o formato. */
const readWav = (file) => {
  const buf = fs.readFileSync(file);
  let at = 12;
  let fmt = null;
  while (at < buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(at + 10), rate: buf.readUInt32LE(at + 12) };
    if (id === 'data') return { ...fmt, pcm: buf.subarray(at + 8, at + 8 + size) };
    at += 8 + size + (size % 2);
  }
  throw new Error(`${file}: sem dados`);
};

const wavBuffer = ({ channels, rate }, pcm) => {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(channels, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * channels * 2, 28); head.writeUInt16LE(channels * 2, 32);
  head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
};

const encode = (input, name, bitrate) => {
  const output = path.join(OUT, `${name}.mp3`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', input, '-c:a', 'libmp3lame', '-b:a', bitrate, output]);
  console.log(`${name.padEnd(18)} ${(fs.statSync(output).size / 1024).toFixed(0)}KB`);
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zh-audio-'));
for (const [name, bitrate] of LOOPS) {
  const wav = readWav(path.join(MASTERS, `${name}.wav`));
  const wrap = Math.round(WRAP_S * wav.rate) * wav.channels * 2;
  const wrapped = Buffer.concat([wav.pcm.subarray(wav.pcm.length - wrap), wav.pcm, wav.pcm.subarray(0, wrap)]);
  const input = path.join(temp, `${name}.wav`);
  fs.writeFileSync(input, wavBuffer(wav, wrapped));
  encode(input, name, bitrate);
  console.log(`  seconds: ${wav.pcm.length / (wav.channels * 2) / wav.rate}`);
}
for (const [name, bitrate] of ONE_SHOTS) encode(path.join(MASTERS, `${name}.wav`), name, bitrate);
fs.rmSync(temp, { recursive: true, force: true });
