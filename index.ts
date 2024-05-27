import Replicate from 'replicate';
import {exec} from 'child_process';
import fs from 'fs';
import util from 'util';
import axios from 'axios';
import * as path from 'path';

const replicate = new Replicate({
  auth: '',
});
const execPromise = util.promisify(exec);

const script = [
  {
    narration:
      "Google’s AI Oopsies: Google's new AI search feature is spewing some bizarre results, prompting a scramble to clean things up. Who knew AI could be so imaginative?",
    videoPrompt:
      "photo of search bar with strange AI-generated search results popping up, Google's logo, cleanup animation, 8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3",
  },
  {
    narration:
      'SpaceX Starship Launch: Mark your calendars for June 5th! SpaceX is giving their Starship another go, hoping it’ll finally stick the landing. Third time’s a charm, right?',
    videoPrompt:
      'Display a SpaceX Starship preparing for launch, followed by a countdown and liftoff animation.',
  },
  {
    narration:
      "Musk’s Supercomputer: Elon Musk's xAI is planning a massive supercomputer by 2025, aiming to be four times bigger than current ones. Skynet, anyone?",
    videoPrompt:
      'Show Elon Musk speaking with a futuristic supercomputer behind him, and graphics illustrating the size comparison with existing supercomputers.',
  },
  {
    narration: 'Stay curious, stay updated!',
    videoPrompt:
      'Show a montage of tech scenes, like people working on computers, robots, and space images, ending with the newsletter logo.',
  },
];

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await axios.get(url, {responseType: 'stream'});
  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function createNarration(prompt: string, index: number): Promise<string> {
  const input = {prompt};
  const output = (await replicate.run(
    'suno-ai/bark:b76242b40d67c76ab6742e987628a2a9ac019e11d56ab96c4e91ce03b79b2787',
    {input}
  )) as {audio_out: string};
  const narrationPath = `narration_${index}.mp3`;
  await downloadFile(output.audio_out, narrationPath);
  return narrationPath;
}

async function createVideo(prompt: string, index: number): Promise<string> {
  const input = {
    seed: Math.floor(Math.random() * 10000),
    prompt,
    mp4: true,
  };
  const output = (await replicate.run(
    'lucataco/hotshot-xl:78b3a6257e16e4b241245d65c8b2b81ea2e1ff7ed4c55306b511509ddbfd327a',
    {input}
  )) as unknown as string;
  const videoPath = `video_${index}.mp4`;
  await downloadFile(output, videoPath);
  return videoPath;
}

async function loopAndCombine(
  videoFile: string,
  audioFile: string,
  outputFile: string
) {
  const command = `ffmpeg -stream_loop -1 -i "${videoFile}" -i "${audioFile}" -shortest -c:v libx264 -c:a aac -movflags +faststart "${outputFile}"`;
  console.log('Executing command:', command);
  try {
    const {stdout, stderr} = await execPromise(command);
    console.log('FFmpeg stdout:', stdout);
    console.log('FFmpeg stderr:', stderr);
  } catch (error) {
    console.error('Error executing FFmpeg command:', error);
  }
}

async function processFiles(inputFilePath: string) {
  const inputs = fs.readFileSync(inputFilePath, 'utf8').trim().split('\n');
  const cleanedInputs = inputs.map((input) =>
    input.replace(/^file '/, '').replace(/'$/, '')
  );
  console.log(cleanedInputs);

  for (let i = 0; i < cleanedInputs.length; i += 2) {
    const videoFile = cleanedInputs[i];
    const audioFile = cleanedInputs[i + 1];
    const outputFile = `output_${i / 2}.mp4`;

    await loopAndCombine(videoFile, audioFile, outputFile);
  }
}

async function generateFileList(outputDir: string) {
  const files = fs
    .readdirSync(outputDir)
    .filter((file) => file.endsWith('.mp4'))
    .map((file) => `file '${path.join(outputDir, file)}'`)
    .join('\n');
  fs.writeFileSync(path.join(outputDir, 'filelist.txt'), files);
  console.log('filelist.txt generated successfully.');
}

async function concatenateVideos(outputDir: string, outputFile: string) {
  const fileListPath = path.join(outputDir, 'filelist.txt');
  const command = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy "${outputFile}"`;
  console.log('Executing command:', command);
  try {
    const {stdout, stderr} = await execPromise(command);
    console.log('FFmpeg stdout:', stdout);
    console.log('FFmpeg stderr:', stderr);
    console.log('Videos concatenated successfully.');
  } catch (error) {
    console.error('Error concatenating videos:', error);
  }
}

async function main() {
  const narrations: string[] = [];
  const videos: string[] = [];

  for (let i = 0; i < script.length; i++) {
    const {narration, videoPrompt} = script[i];

    const narrationPath = await createNarration(narration, i);
    narrations.push(narrationPath);

    const videoPath = await createVideo(videoPrompt, i);
    videos.push(videoPath);
  }

  const inputFilePath = 'inputs.txt';
  fs.writeFileSync(
    inputFilePath,
    narrations.map((n, i) => `file '${videos[i]}'\nfile '${n}'`).join('\n')
  );

  await processFiles(inputFilePath);
  await generateFileList('./');
  await concatenateVideos('./', 'final_output.mp4');
}

main().catch(console.error);
